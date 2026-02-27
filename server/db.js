import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'marcenaria.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ═══════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'vendedor',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    nome TEXT NOT NULL,
    tel TEXT DEFAULT '',
    email TEXT DEFAULT '',
    arq TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    -- Campos novos v2
    tipo_pessoa TEXT DEFAULT 'fisica',
    cpf TEXT DEFAULT '',
    cnpj TEXT DEFAULT '',
    cep TEXT DEFAULT '',
    endereco TEXT DEFAULT '',
    numero TEXT DEFAULT '',
    complemento TEXT DEFAULT '',
    bairro TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    obs TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orcamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    cliente_id INTEGER REFERENCES clientes(id),
    cliente_nome TEXT DEFAULT '',
    ambiente TEXT DEFAULT '',
    mods_json TEXT DEFAULT '[]',
    obs TEXT DEFAULT '',
    custo_material REAL DEFAULT 0,
    valor_venda REAL DEFAULT 0,
    status TEXT DEFAULT 'rascunho',
    kb_col TEXT DEFAULT 'lead',
    -- Campos novos v2
    numero TEXT DEFAULT '',
    data_vencimento DATE,
    status_proposta TEXT DEFAULT 'rascunho',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS empresa_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    nome TEXT DEFAULT '',
    cnpj TEXT DEFAULT '',
    endereco TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    cep TEXT DEFAULT '',
    telefone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    site TEXT DEFAULT '',
    logo_header_path TEXT DEFAULT '',
    logo_watermark_path TEXT DEFAULT '',
    logo_watermark_opacity REAL DEFAULT 0.15,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS modelos_documento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL DEFAULT 'orcamento',
    nome TEXT NOT NULL,
    html_template TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portal_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orc_id INTEGER NOT NULL REFERENCES orcamentos(id),
    token TEXT UNIQUE NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_acesso DATETIME
  );

  CREATE TABLE IF NOT EXISTS proposta_acessos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orc_id INTEGER NOT NULL REFERENCES orcamentos(id),
    token TEXT NOT NULL,
    acessado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_cliente TEXT DEFAULT '',
    user_agent TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    status TEXT DEFAULT 'nao_iniciado',
    data_inicio DATE,
    data_vencimento DATE,
    token TEXT UNIQUE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS etapas_projeto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    data_inicio DATE,
    data_vencimento DATE,
    status TEXT DEFAULT 'nao_iniciado',
    ordem INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ocorrencias_projeto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    assunto TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    autor TEXT DEFAULT '',
    status TEXT DEFAULT 'aberto',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config_taxas (
    id INTEGER PRIMARY KEY DEFAULT 1,
    imp REAL DEFAULT 8,
    com REAL DEFAULT 10,
    mont REAL DEFAULT 12,
    lucro REAL DEFAULT 20,
    frete REAL DEFAULT 2,
    mdo REAL DEFAULT 350,
    inst REAL DEFAULT 180
  );

  -- ═══ ERP: Despesas do Projeto ═══
  CREATE TABLE IF NOT EXISTS despesas_projeto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL DEFAULT 0,
    data DATE,
    categoria TEXT DEFAULT 'material',
    fornecedor TEXT DEFAULT '',
    observacao TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ ERP: Contas a Receber ═══
  CREATE TABLE IF NOT EXISTS contas_receber (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL DEFAULT 0,
    data_vencimento DATE,
    status TEXT DEFAULT 'pendente',
    data_pagamento DATE,
    meio_pagamento TEXT DEFAULT '',
    observacao TEXT DEFAULT '',
    auto_gerada INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ ERP: Contas a Pagar ═══
  CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL DEFAULT 0,
    data_vencimento DATE,
    data_pagamento DATE,
    status TEXT DEFAULT 'pendente',
    categoria TEXT DEFAULT 'geral',
    fornecedor TEXT DEFAULT '',
    meio_pagamento TEXT DEFAULT '',
    codigo_barras TEXT DEFAULT '',
    projeto_id INTEGER REFERENCES projetos(id),
    despesa_projeto_id INTEGER REFERENCES despesas_projeto(id),
    recorrente INTEGER DEFAULT 0,
    frequencia TEXT DEFAULT '',
    recorrencia_pai_id INTEGER REFERENCES contas_pagar(id),
    observacao TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ ERP: Estoque ═══
  CREATE TABLE IF NOT EXISTS estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES biblioteca(id),
    quantidade REAL NOT NULL DEFAULT 0,
    quantidade_minima REAL DEFAULT 0,
    localizacao TEXT DEFAULT '',
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ ERP: Movimentações de Estoque ═══
  CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES biblioteca(id),
    projeto_id INTEGER REFERENCES projetos(id),
    tipo TEXT NOT NULL DEFAULT 'entrada',
    quantidade REAL NOT NULL,
    valor_unitario REAL DEFAULT 0,
    descricao TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ ERP: Tokens de Montador ═══
  CREATE TABLE IF NOT EXISTS montador_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    token TEXT UNIQUE NOT NULL,
    nome_montador TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ WhatsApp + IA: Chat ═══
  CREATE TABLE IF NOT EXISTS chat_conversas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    wa_phone TEXT DEFAULT '',
    wa_name TEXT DEFAULT '',
    status TEXT DEFAULT 'ia',
    nao_lidas INTEGER DEFAULT 0,
    ultimo_msg_em DATETIME,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL REFERENCES chat_conversas(id),
    wa_message_id TEXT DEFAULT '',
    direcao TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto',
    conteudo TEXT NOT NULL DEFAULT '',
    media_url TEXT DEFAULT '',
    remetente TEXT DEFAULT '',
    remetente_id INTEGER REFERENCES users(id),
    interno INTEGER DEFAULT 0,
    status_envio TEXT DEFAULT 'enviado',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ IA: Base de Conhecimento ═══
  CREATE TABLE IF NOT EXISTS ia_contexto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    titulo TEXT DEFAULT '',
    conteudo TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ IA: Follow-ups Inteligentes ═══
  CREATE TABLE IF NOT EXISTS ia_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    tipo TEXT DEFAULT 'followup',
    mensagem TEXT NOT NULL,
    prioridade TEXT DEFAULT 'media',
    status TEXT DEFAULT 'pendente',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ Colaboradores (Mão de Obra) ═══
  CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    funcao TEXT DEFAULT '',
    valor_hora REAL DEFAULT 0,
    telefone TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS apontamentos_horas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    projeto_id INTEGER REFERENCES projetos(id),
    etapa_id INTEGER REFERENCES etapas_projeto(id),
    data DATE NOT NULL,
    horas REAL NOT NULL,
    descricao TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ═══ Fotos do Montador ═══
  CREATE TABLE IF NOT EXISTS montador_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    token_id INTEGER REFERENCES montador_tokens(id),
    nome_montador TEXT DEFAULT '',
    ambiente TEXT DEFAULT '',
    filename TEXT NOT NULL,
    visivel_portal INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS modulos_custom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    tipo_item TEXT DEFAULT 'modulo_pai',
    json_data TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS biblioteca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL DEFAULT 'material',
    cod TEXT DEFAULT '',
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    unidade TEXT DEFAULT 'un',
    preco REAL DEFAULT 0,
    -- Campos para materiais (chapas)
    espessura REAL DEFAULT 0,
    largura REAL DEFAULT 0,
    altura REAL DEFAULT 0,
    perda_pct REAL DEFAULT 15,
    preco_m2 REAL DEFAULT 0,
    -- Campos gerais
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ═══ Templates de etapas ═══
db.exec(`
  CREATE TABLE IF NOT EXISTS etapas_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    etapas_json TEXT NOT NULL DEFAULT '[]',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ═══════════════════════════════════════════════════════
// MIGRAÇÕES — Colunas novas em tabelas existentes
// ═══════════════════════════════════════════════════════
const migrations = [
  // clientes v2
  "ALTER TABLE clientes ADD COLUMN tipo_pessoa TEXT DEFAULT 'fisica'",
  "ALTER TABLE clientes ADD COLUMN cpf TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN cnpj TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN cep TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN endereco TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN numero TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN complemento TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN bairro TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN estado TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN obs TEXT DEFAULT ''",
  // orcamentos v2
  "ALTER TABLE orcamentos ADD COLUMN numero TEXT DEFAULT ''",
  "ALTER TABLE orcamentos ADD COLUMN data_vencimento DATE",
  "ALTER TABLE orcamentos ADD COLUMN status_proposta TEXT DEFAULT 'rascunho'",
  // modulos_custom v2
  "ALTER TABLE modulos_custom ADD COLUMN tipo_item TEXT DEFAULT 'modulo_pai'",
  // modulos_custom v3 — nome dedicado para listagem rápida
  "ALTER TABLE modulos_custom ADD COLUMN nome TEXT DEFAULT ''",
  // users v2 — permissões por menu (JSON array de IDs de página, NULL = tudo liberado)
  "ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL",
  // users v3 — rastreamento de último acesso
  "ALTER TABLE users ADD COLUMN ultimo_acesso DATETIME DEFAULT NULL",
  // biblioteca v2 — preço da fita de borda por material (R$/m)
  "ALTER TABLE biblioteca ADD COLUMN fita_preco REAL DEFAULT 0",
  // empresa_config v2 — template do contrato
  "ALTER TABLE empresa_config ADD COLUMN contrato_template TEXT DEFAULT ''",
  // empresa_config v3 — configurações da proposta comercial
  "ALTER TABLE empresa_config ADD COLUMN proposta_cor_primaria TEXT DEFAULT '#1B2A4A'",
  "ALTER TABLE empresa_config ADD COLUMN proposta_cor_accent TEXT DEFAULT '#C9A96E'",
  "ALTER TABLE empresa_config ADD COLUMN proposta_sobre TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN proposta_garantia TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN proposta_consideracoes TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN proposta_rodape TEXT DEFAULT ''",
  // portal_tokens v2 — armazenar HTML da proposta + nível
  "ALTER TABLE portal_tokens ADD COLUMN html_proposta TEXT DEFAULT ''",
  "ALTER TABLE portal_tokens ADD COLUMN nivel TEXT DEFAULT 'geral'",
  // proposta_acessos v2 — tracking avançado
  "ALTER TABLE proposta_acessos ADD COLUMN dispositivo TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN navegador TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN os_name TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN cidade TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN estado TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN pais TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN resolucao TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN fingerprint TEXT DEFAULT ''",
  "ALTER TABLE proposta_acessos ADD COLUMN tempo_pagina INTEGER DEFAULT 0",
  "ALTER TABLE proposta_acessos ADD COLUMN scroll_max INTEGER DEFAULT 0",
  "ALTER TABLE proposta_acessos ADD COLUMN is_new_visit INTEGER DEFAULT 1",
  // ═══ ERP v2 — expansão projetos ═══
  // Responsável por etapa
  "ALTER TABLE etapas_projeto ADD COLUMN responsavel_id INTEGER REFERENCES users(id)",
  // Cliente e materiais orçados no projeto
  "ALTER TABLE projetos ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)",
  "ALTER TABLE projetos ADD COLUMN materiais_orcados TEXT DEFAULT ''",
  // Google Drive
  "ALTER TABLE empresa_config ADD COLUMN gdrive_credentials TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN gdrive_folder_id TEXT DEFAULT ''",
  "ALTER TABLE projetos ADD COLUMN gdrive_folder_id TEXT DEFAULT ''",
  // ═══ WhatsApp config ═══
  "ALTER TABLE empresa_config ADD COLUMN wa_instance_url TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN wa_instance_name TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN wa_api_key TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN wa_webhook_token TEXT DEFAULT ''",
  // ═══ IA config ═══
  "ALTER TABLE empresa_config ADD COLUMN ia_provider TEXT DEFAULT 'anthropic'",
  "ALTER TABLE empresa_config ADD COLUMN ia_api_key TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN ia_model TEXT DEFAULT 'claude-sonnet-4'",
  "ALTER TABLE empresa_config ADD COLUMN ia_system_prompt TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN ia_temperatura REAL DEFAULT 0.7",
  "ALTER TABLE empresa_config ADD COLUMN ia_ativa INTEGER DEFAULT 0",
  // ═══ Gantt melhorado ═══
  "ALTER TABLE etapas_projeto ADD COLUMN progresso INTEGER DEFAULT 0",
  "ALTER TABLE etapas_projeto ADD COLUMN dependencia_id INTEGER REFERENCES etapas_projeto(id)",
  // biblioteca v3 — categoria de ferragem (dobradiça, corrediça, puxador, etc.)
  "ALTER TABLE biblioteca ADD COLUMN categoria TEXT DEFAULT ''",
  // identidade visual do sistema (sidebar + login)
  "ALTER TABLE empresa_config ADD COLUMN logo_sistema TEXT DEFAULT ''",
  // contas a pagar — link bidirecional com despesas_projeto
  "ALTER TABLE despesas_projeto ADD COLUMN conta_pagar_id INTEGER REFERENCES contas_pagar(id)",
  // UpMobb toggle
  "ALTER TABLE empresa_config ADD COLUMN upmobb_ativo INTEGER DEFAULT 0",
  // ═══ Aditivos (orçamento vinculado ao original) ═══
  "ALTER TABLE orcamentos ADD COLUMN parent_orc_id INTEGER REFERENCES orcamentos(id)",
  "ALTER TABLE orcamentos ADD COLUMN tipo TEXT DEFAULT 'original'",
  "ALTER TABLE orcamentos ADD COLUMN motivo_aditivo TEXT DEFAULT ''",
  // ═══ Lead Capture — origem e rastreamento ═══
  "ALTER TABLE clientes ADD COLUMN origem TEXT DEFAULT 'manual'",
  "ALTER TABLE clientes ADD COLUMN utm_source TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN utm_medium TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN utm_campaign TEXT DEFAULT ''",
  "ALTER TABLE clientes ADD COLUMN data_captacao DATETIME DEFAULT CURRENT_TIMESTAMP",
  // ═══ Automações log ═══
  `CREATE TABLE IF NOT EXISTS automacoes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    referencia_id INTEGER,
    referencia_tipo TEXT,
    descricao TEXT,
    status TEXT DEFAULT 'enviado',
    erro TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Conteúdo Marketing ═══
  `CREATE TABLE IF NOT EXISTS conteudo_marketing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    titulo TEXT NOT NULL,
    tipo TEXT DEFAULT 'post',
    texto TEXT DEFAULT '',
    plataforma TEXT DEFAULT 'instagram',
    status TEXT DEFAULT 'rascunho',
    data_publicar DATE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Fase 7: CRM Histórico + Notas ═══
  `CREATE TABLE IF NOT EXISTS cliente_notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    titulo TEXT DEFAULT '',
    conteudo TEXT NOT NULL,
    cor TEXT DEFAULT '#3b82f6',
    fixado INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS cliente_interacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    tipo TEXT NOT NULL DEFAULT 'nota',
    descricao TEXT NOT NULL,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    meta TEXT DEFAULT '{}',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // Campos extras em clientes
  `ALTER TABLE clientes ADD COLUMN origem TEXT DEFAULT 'manual'`,
  `ALTER TABLE clientes ADD COLUMN indicado_por TEXT DEFAULT ''`,
  `ALTER TABLE clientes ADD COLUMN data_nascimento DATE`,
  // Documentos do cliente
  `CREATE TABLE IF NOT EXISTS cliente_documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'documento',
    url TEXT NOT NULL,
    tamanho INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Portal v2: Mensagens bidirecionais ═══
  `CREATE TABLE IF NOT EXISTS portal_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    autor_tipo TEXT NOT NULL DEFAULT 'cliente',
    autor_nome TEXT DEFAULT '',
    conteudo TEXT NOT NULL,
    lida INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // Portal v2: token no projeto para facilitar lookup
  "ALTER TABLE projetos ADD COLUMN portal_notif_email TEXT DEFAULT ''",
  // ═══ Portal: controle de visibilidade das fotos ═══
  "ALTER TABLE montador_fotos ADD COLUMN visivel_portal INTEGER DEFAULT 0",
  // ═══ Sistema de Notificações ═══
  `CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    mensagem TEXT DEFAULT '',
    referencia_id INTEGER,
    referencia_tipo TEXT,
    referencia_extra TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    ativo INTEGER DEFAULT 1,
    expira_em DATETIME,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS notificacoes_lidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notificacao_id INTEGER NOT NULL REFERENCES notificacoes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    lida_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(notificacao_id, user_id)
  )`,
  // ═══ Log de Atividades ═══
  `CREATE TABLE IF NOT EXISTS atividades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    user_nome TEXT NOT NULL,
    acao TEXT NOT NULL,
    descricao TEXT NOT NULL,
    referencia_id INTEGER,
    referencia_tipo TEXT,
    detalhes TEXT DEFAULT '{}',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Entrega Digital — Fotos por módulo (só gerente) ═══
  `CREATE TABLE IF NOT EXISTS entrega_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    ambiente_idx INTEGER NOT NULL DEFAULT 0,
    item_idx INTEGER DEFAULT NULL,
    filename TEXT NOT NULL,
    nota TEXT DEFAULT '',
    gdrive_file_id TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Contas a Receber — Parcelamento + Boleto + NF ═══
  "ALTER TABLE contas_receber ADD COLUMN codigo_barras TEXT DEFAULT ''",
  "ALTER TABLE contas_receber ADD COLUMN nf_numero TEXT DEFAULT ''",
  "ALTER TABLE contas_receber ADD COLUMN parcela_num INTEGER DEFAULT 0",
  "ALTER TABLE contas_receber ADD COLUMN parcela_total INTEGER DEFAULT 0",
  "ALTER TABLE contas_receber ADD COLUMN grupo_parcela_id INTEGER DEFAULT NULL",
  // ═══ Contas a Pagar — Parcelamento ═══
  "ALTER TABLE contas_pagar ADD COLUMN parcela_num INTEGER DEFAULT 0",
  "ALTER TABLE contas_pagar ADD COLUMN parcela_total INTEGER DEFAULT 0",
  "ALTER TABLE contas_pagar ADD COLUMN grupo_parcela_id INTEGER DEFAULT NULL",
  // ═══ Contas a Pagar — Nota Fiscal ═══
  "ALTER TABLE contas_pagar ADD COLUMN nf_numero TEXT DEFAULT ''",
  "ALTER TABLE contas_pagar ADD COLUMN nf_chave TEXT DEFAULT ''",
  // ═══ Contas a Pagar — Anexos ═══
  `CREATE TABLE IF NOT EXISTS contas_pagar_anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_pagar_id INTEGER NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'boleto',
    filename TEXT NOT NULL,
    tamanho INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Google Drive OAuth ═══
  "ALTER TABLE empresa_config ADD COLUMN gdrive_client_id TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN gdrive_client_secret TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN gdrive_refresh_token TEXT DEFAULT ''",
  // ═══ Google Drive file IDs ═══
  "ALTER TABLE montador_fotos ADD COLUMN gdrive_file_id TEXT DEFAULT ''",
  "ALTER TABLE contas_pagar_anexos ADD COLUMN gdrive_file_id TEXT DEFAULT ''",
  // ═══ Projeto Arquivos (tracking de arquivos em banco) ═══
  `CREATE TABLE IF NOT EXISTS projeto_arquivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    filename TEXT NOT NULL,
    tipo TEXT DEFAULT '',
    tamanho INTEGER DEFAULT 0,
    gdrive_file_id TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_projeto_arquivos_projeto ON projeto_arquivos(projeto_id)",
  // ═══ Renomear Componentes → Acessórios na biblioteca ═══
  "UPDATE biblioteca SET tipo='acessorio' WHERE tipo='componente'",
  // ═══ Engine v2: Markups por categoria ═══
  "ALTER TABLE config_taxas ADD COLUMN mk_chapas REAL DEFAULT 1.45",
  "ALTER TABLE config_taxas ADD COLUMN mk_ferragens REAL DEFAULT 1.15",
  "ALTER TABLE config_taxas ADD COLUMN mk_fita REAL DEFAULT 1.45",
  "ALTER TABLE config_taxas ADD COLUMN mk_acabamentos REAL DEFAULT 1.30",
  "ALTER TABLE config_taxas ADD COLUMN mk_acessorios REAL DEFAULT 1.20",
  "ALTER TABLE config_taxas ADD COLUMN mk_mdo REAL DEFAULT 0.80",
  // inst muda de R$/m² (180) para % do PV (5); lucro de 20 para 12; mont de 12 para 0
  "UPDATE config_taxas SET inst=5 WHERE inst=180",
  "UPDATE config_taxas SET lucro=12 WHERE lucro=20",
  "UPDATE config_taxas SET mont=0 WHERE mont=12",
  // ═══ Rastreabilidade v2: evento_tipo em acessos ═══
  "ALTER TABLE proposta_acessos ADD COLUMN evento_tipo TEXT DEFAULT ''",
  // ═══ Templates de Ambiente (Kits) ═══
  `CREATE TABLE IF NOT EXISTS ambiente_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    categoria TEXT DEFAULT '',
    json_data TEXT NOT NULL DEFAULT '{}',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Materiais Recentes: contador de uso ═══
  "ALTER TABLE biblioteca ADD COLUMN uso_count INTEGER DEFAULT 0",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* coluna já existe */ }
}

// ═══ Índices de performance (ERP) ═══
const indexes = [
  "CREATE INDEX IF NOT EXISTS idx_despesas_projeto ON despesas_projeto(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_contas_projeto ON contas_receber(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_contas_status ON contas_receber(status, data_vencimento)",
  "CREATE INDEX IF NOT EXISTS idx_mov_estoque ON movimentacoes_estoque(material_id, projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimentacoes_estoque(tipo)",
  // WhatsApp + IA
  "CREATE INDEX IF NOT EXISTS idx_chat_conversas_cliente ON chat_conversas(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_conversas_phone ON chat_conversas(wa_phone)",
  "CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa ON chat_mensagens(conversa_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_mensagens_wa_id ON chat_mensagens(wa_message_id)",
  "CREATE INDEX IF NOT EXISTS idx_ia_followups_cliente ON ia_followups(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_ia_followups_status ON ia_followups(status)",
  // Recursos + Montador fotos
  "CREATE INDEX IF NOT EXISTS idx_apontamentos_colab ON apontamentos_horas(colaborador_id)",
  "CREATE INDEX IF NOT EXISTS idx_apontamentos_projeto ON apontamentos_horas(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_montador_fotos_projeto ON montador_fotos(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_montador_fotos_token ON montador_fotos(token_id)",
  // Aditivos
  "CREATE INDEX IF NOT EXISTS idx_orc_parent ON orcamentos(parent_orc_id)",
  // CRM Histórico
  "CREATE INDEX IF NOT EXISTS idx_cliente_notas ON cliente_notas(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_cliente_interacoes ON cliente_interacoes(cliente_id, data)",
  "CREATE INDEX IF NOT EXISTS idx_cliente_docs ON cliente_documentos(cliente_id)",
  // Portal v2
  "CREATE INDEX IF NOT EXISTS idx_portal_mensagens_projeto ON portal_mensagens(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_portal_mensagens_token ON portal_mensagens(token)",
  // Performance indexes
  "CREATE INDEX IF NOT EXISTS idx_orcamentos_user ON orcamentos(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON orcamentos(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_orcamentos_kbcol ON orcamentos(kb_col)",
  "CREATE INDEX IF NOT EXISTS idx_orcamentos_atualizado ON orcamentos(atualizado_em)",
  "CREATE INDEX IF NOT EXISTS idx_projetos_user ON projetos(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_projetos_orc ON projetos(orc_id)",
  "CREATE INDEX IF NOT EXISTS idx_projetos_cliente ON projetos(cliente_id)",
  "CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status)",
  "CREATE INDEX IF NOT EXISTS idx_clientes_user ON clientes(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_contas_pagar_status_venc ON contas_pagar(status, data_vencimento)",
  "CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status, data_vencimento)",
  "CREATE INDEX IF NOT EXISTS idx_contas_receber_projeto ON contas_receber(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_despesas_projeto ON despesas_projeto(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_etapas_projeto ON etapas_projeto(projeto_id)",
  // Notificações + Atividades
  "CREATE INDEX IF NOT EXISTS idx_notificacoes_ativo ON notificacoes(ativo, criado_em)",
  "CREATE INDEX IF NOT EXISTS idx_notificacoes_ref ON notificacoes(referencia_tipo, referencia_id)",
  "CREATE INDEX IF NOT EXISTS idx_notificacoes_lidas_user ON notificacoes_lidas(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_notificacoes_lidas_notif ON notificacoes_lidas(notificacao_id)",
  "CREATE INDEX IF NOT EXISTS idx_atividades_criado ON atividades(criado_em)",
  "CREATE INDEX IF NOT EXISTS idx_atividades_ref ON atividades(referencia_tipo, referencia_id)",
  // Contas a Pagar v2
  "CREATE INDEX IF NOT EXISTS idx_contas_pagar_grupo ON contas_pagar(grupo_parcela_id)",
  "CREATE INDEX IF NOT EXISTS idx_contas_pagar_recorrencia ON contas_pagar(recorrencia_pai_id)",
  "CREATE INDEX IF NOT EXISTS idx_contas_pagar_anexos ON contas_pagar_anexos(conta_pagar_id)",
  // ═══ Entrega Digital ═══
  "CREATE INDEX IF NOT EXISTS idx_entrega_fotos_projeto ON entrega_fotos(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_entrega_fotos_item ON entrega_fotos(projeto_id, ambiente_idx, item_idx)",
];
for (const sql of indexes) {
  try { db.exec(sql); } catch (_) { }
}

// Backfill: gerar números para orçamentos que ainda não têm
{
  const semNumero = db.prepare("SELECT id, criado_em FROM orcamentos WHERE numero IS NULL OR numero = '' ORDER BY id").all();
  if (semNumero.length > 0) {
    const stmt = db.prepare('UPDATE orcamentos SET numero = ? WHERE id = ?');
    semNumero.forEach(o => {
      const ano = o.criado_em ? new Date(o.criado_em).getFullYear() : new Date().getFullYear();
      stmt.run(`ORN-${ano}-${String(o.id).padStart(5, '0')}`, o.id);
    });
    console.log(`[OK] Numeração retroativa: ${semNumero.length} orçamento(s) numerado(s)`);
  }
}

// Seed empresa_config
const empExists = db.prepare('SELECT id FROM empresa_config WHERE id = 1').get();
if (!empExists) {
  db.prepare("INSERT INTO empresa_config (id, nome) VALUES (1, 'Minha Marcenaria')").run();
}

// ═══════════════════════════════════════════════════════
// SEED — Usuário admin + config padrão
// ═══════════════════════════════════════════════════════
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@admin.com');
if (!adminExists) {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO users (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)').run('Administrador', 'admin@admin.com', hash, 'admin');
  if (adminPass === 'admin123') console.log('* Admin criado: admin@admin.com / admin123 (ALTERE em producao via ADMIN_PASSWORD env)');
  else console.log('* Admin criado: admin@admin.com (senha via env)');
}

const configExists = db.prepare('SELECT id FROM config_taxas WHERE id = 1').get();
if (!configExists) {
  db.prepare('INSERT INTO config_taxas (id) VALUES (1)').run();
  console.log('[OK] Config taxas padrão criada');
}

// Seed clientes de exemplo
const clientCount = db.prepare('SELECT COUNT(*) as c FROM clientes').get();
if (clientCount.c === 0) {
  const adminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (adminUser) {
    db.prepare('INSERT INTO clientes (user_id, nome, tel, email, arq, cidade) VALUES (?, ?, ?, ?, ?, ?)').run(adminUser.id, 'Maria Silva', '(98)99999-1111', 'maria@email.com', '', 'São Luís');
    db.prepare('INSERT INTO clientes (user_id, nome, tel, email, arq, cidade) VALUES (?, ?, ?, ?, ?, ?)').run(adminUser.id, 'João Santos', '(98)99999-2222', 'joao@email.com', 'Arq. Ana Costa', 'São Luís');
    console.log('[OK] Clientes de exemplo criados');
  }
}

// Seed biblioteca items
const bibCount = db.prepare('SELECT COUNT(*) as c FROM biblioteca').get();
if (bibCount.c === 0) {
  const ins = db.prepare('INSERT INTO biblioteca (tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  ins.run('material', 'mdf15', 'MDF 15mm', 'Chapa MDF cru 15mm', 'chapa', 189.90, 15, 2750, 1850, 15, 0);
  ins.run('material', 'mdf18', 'MDF 18mm', 'Chapa MDF cru 18mm', 'chapa', 219.90, 18, 2750, 1850, 15, 0);
  ins.run('material', 'mdf25', 'MDF 25mm', 'Chapa MDF cru 25mm', 'chapa', 289.90, 25, 2750, 1850, 15, 0);
  ins.run('material', 'mdp15', 'MDP 15mm BP', 'Chapa MDP BP 15mm', 'chapa', 149.90, 15, 2750, 1850, 15, 0);
  ins.run('material', 'mdp18', 'MDP 18mm BP', 'Chapa MDP BP 18mm', 'chapa', 169.90, 18, 2750, 1850, 15, 0);
  ins.run('material', 'comp3', 'Compensado 3mm', 'Compensado fundo/costas', 'chapa', 42.90, 3, 2200, 1600, 10, 0);
  ins.run('acabamento', 'bp_branco', 'BP Branco TX', 'Acabamento incluso', 'm²', 0, 0, 0, 0, 0, 0);
  ins.run('acabamento', 'bp_cinza', 'BP Cinza Etna', 'Acabamento incluso', 'm²', 0, 0, 0, 0, 0, 0);
  ins.run('acabamento', 'bp_nogueira', 'BP Nogueira Boreal', 'Acabamento incluso', 'm²', 0, 0, 0, 0, 0, 0);
  ins.run('acabamento', 'lam_freijo', 'Lâmina Natural Freijó', 'Acabamento premium', 'm²', 85, 0, 0, 0, 0, 85);
  ins.run('acabamento', 'lam_carv', 'Lâmina Natural Carvalho', 'Acabamento premium', 'm²', 95, 0, 0, 0, 0, 95);
  ins.run('acabamento', 'laca_branca', 'Laca PU Branca Fosca', 'Acabamento laca', 'm²', 120, 0, 0, 0, 0, 120);
  ins.run('acabamento', 'laca_color', 'Laca PU Colorida Fosca', 'Acabamento laca color', 'm²', 135, 0, 0, 0, 0, 135);
  ins.run('ferragem', 'corr350', 'Corrediça 350mm', '', 'par', 28.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'corr400', 'Corrediça 400mm', '', 'par', 32.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'corr500', 'Corrediça 500mm', '', 'par', 42.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'corrFH', 'Corrediça Full Ext. Soft', '', 'par', 68.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'dob110', 'Dobradiça 110° Amort.', '', 'un', 8.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'dob165', 'Dobradiça 165° Amort.', '', 'un', 14.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'pux128', 'Puxador 128mm', '', 'un', 12.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'pux160', 'Puxador 160mm', '', 'un', 16.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'pux256', 'Puxador 256mm', '', 'un', 22.90, 0, 0, 0, 0, 0);
  ins.run('ferragem', 'pistGas', 'Pistão a Gás 100N', '', 'par', 34.90, 0, 0, 0, 0, 0);
  ins.run('acessorio', 'cabOval', 'Cabideiro Tubo Oval', 'Tubo oval para roupeiro', 'm', 18.90, 0, 0, 0, 0, 0);
  ins.run('acessorio', 'sapReg', 'Sapateira Regulável', '', 'un', 45.90, 0, 0, 0, 0, 0);
  ins.run('acessorio', 'cestoAr', 'Cesto Aramado', '', 'un', 65.90, 0, 0, 0, 0, 0);
  ins.run('material', 'fita_pvc', 'Fita de Borda PVC', 'Fita de borda 22mm', 'm', 0.85, 0, 0, 0, 0, 0);
  console.log('[OK] Biblioteca inicial criada');
}

// ═══════════════════════════════════════════════════════
// SEED CATÁLOGO v2 — Caixas e Componentes
// Recria o catálogo se não houver itens do tipo 'caixa'
// ═══════════════════════════════════════════════════════
const caixaCount = db.prepare("SELECT COUNT(*) as c FROM modulos_custom WHERE tipo_item = 'caixa'").get();
if (caixaCount.c === 0) {
  // Limpa catálogo antigo
  db.prepare('DELETE FROM modulos_custom').run();

  const ins = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (1, ?, ?, ?)');

  // ─── CAIXAS ───────────────────────────────────────────────
  ins.run('caixa', 'Caixa Alta', JSON.stringify({
    nome: 'Caixa Alta',
    cat: 'caixaria',
    desc: 'Roupeiro, despensa, armário — caixaria completa',
    coef: 0.35,
    pecas: [
      { id: 'le', nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'ld', nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'tp', nome: 'Topo',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f']      },
      { id: 'bs', nome: 'Base',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f']      },
      { id: 'fn', nome: 'Fundo',         qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: []         },
    ],
    tamponamentos: [
      { id: 'te', nome: 'Tamp. Lat. Esq.', face: 'lat_esq', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'td', nome: 'Tamp. Lat. Dir.', face: 'lat_dir', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'tt', nome: 'Tamp. Topo',      face: 'topo',    calc: 'L*P',   mat: 'ext', fita: ['f']     },
      { id: 'tb', nome: 'Rodapé/Base Vista',face: 'base',   calc: 'L*100', mat: 'ext', fita: ['f']     },
    ],
  }));

  ins.run('caixa', 'Caixa Baixa / Balcão', JSON.stringify({
    nome: 'Caixa Baixa / Balcão',
    cat: 'caixaria',
    desc: 'Bancada, balcão cozinha/banheiro',
    coef: 0.30,
    pecas: [
      { id: 'le', nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'ld', nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'tp', nome: 'Topo',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f']      },
      { id: 'bs', nome: 'Base',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f']      },
      { id: 'fn', nome: 'Fundo',         qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: []         },
    ],
    tamponamentos: [
      { id: 'te', nome: 'Tamp. Lat. Esq.', face: 'lat_esq', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'td', nome: 'Tamp. Lat. Dir.', face: 'lat_dir', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'tb', nome: 'Rodapé',          face: 'base',    calc: 'L*100', mat: 'ext', fita: ['f']     },
    ],
  }));

  ins.run('caixa', 'Caixa Aérea', JSON.stringify({
    nome: 'Caixa Aérea',
    cat: 'caixaria',
    desc: 'Módulo suspenso — cozinha, lavanderia',
    coef: 0.25,
    pecas: [
      { id: 'le', nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'ld', nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f']      },
      { id: 'tp', nome: 'Topo',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f']      },
      { id: 'bs', nome: 'Base',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f','b']  },
      { id: 'fn', nome: 'Fundo',         qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: []         },
    ],
    tamponamentos: [
      { id: 'te', nome: 'Acab. Lat. Esq.', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f','b'] },
      { id: 'td', nome: 'Acab. Lat. Dir.', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f','b'] },
      { id: 'tb', nome: 'Acab. Inferior',  face: 'base',    calc: 'L*P', mat: 'ext', fita: ['f']     },
    ],
  }));

  // ─── COMPONENTES ─────────────────────────────────────────
  ins.run('componente', 'Gaveta', JSON.stringify({
    nome: 'Gaveta',
    cat: 'componente',
    desc: 'Gaveta com laterais, base, fundo, frente interna e frente externa',
    coef: 0.20,
    dimsAplicaveis: ['L', 'P'],
    vars: [
      { id: 'ag', label: 'Altura da Gaveta', default: 150, min: 60, max: 400, unit: 'mm' },
    ],
    varsDeriv: { Lg: 'Li', Pg: 'P-50' },
    pecas: [
      { id: 'lat_e', nome: 'Lateral Esq.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
      { id: 'lat_d', nome: 'Lateral Dir.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
      { id: 'base',  nome: 'Base',           qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: []            },
      { id: 'fnd',   nome: 'Fundo',          qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: []            },
      { id: 'fi',    nome: 'Frente Interna', qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: ['all']       },
    ],
    frente_externa: {
      ativa: true,
      id: 'fe', nome: 'Frente Externa',
      calc: 'Lg*ag',
      mat: 'ext_comp',
      fita: ['all'],
    },
    sub_itens: [
      { id: 'corrNorm',   nome: 'Corrediça Normal',   ferrId: 'corr400', defaultOn: true  },
      { id: 'corrOculta', nome: 'Corrediça Oculta',   ferrId: 'corrFH',  defaultOn: false },
      { id: 'puxador',    nome: 'Puxador',             ferrId: 'pux128',  defaultOn: true  },
    ],
  }));

  ins.run('componente', 'Prateleira', JSON.stringify({
    nome: 'Prateleira',
    cat: 'componente',
    desc: 'Prateleira interna regulável',
    coef: 0.05,
    dimsAplicaveis: ['L', 'P'],
    vars: [],
    varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
    pecas: [
      { id: 'prat', nome: 'Prateleira', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['f'] },
    ],
    frente_externa: { ativa: false },
    sub_itens: [
      { id: 'suporte', nome: 'Suporte de Prateleira', ferrId: 'sapReg', defaultOn: true },
    ],
  }));

  ins.run('componente', 'Porta', JSON.stringify({
    nome: 'Porta',
    cat: 'componente',
    desc: 'Porta com dobradiças e puxador',
    coef: 0.15,
    dimsAplicaveis: ['L'],
    vars: [
      { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
      { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
    ],
    varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
    pecas: [],
    frente_externa: {
      ativa: true,
      id: 'porta', nome: 'Porta',
      calc: 'Lp*Ap',
      mat: 'ext_comp',
      fita: ['all'],
    },
    sub_itens: [
      { id: 'dob110',  nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true,  qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
      { id: 'puxador', nome: 'Puxador',         ferrId: 'pux128', defaultOn: true,  qtdFormula: 'nPortas' },
    ],
  }));

  ins.run('componente', 'Divisória Vertical', JSON.stringify({
    nome: 'Divisória Vertical',
    cat: 'componente',
    desc: 'Divisória interna vertical',
    coef: 0.10,
    dimsAplicaveis: ['A', 'P'],
    vars: [],
    varsDeriv: { Ldv: 'Ai', Pdv: 'Pi' },
    pecas: [
      { id: 'div', nome: 'Divisória Vertical', qtd: 1, calc: 'Ldv*Pdv', mat: 'int', fita: ['f'] },
    ],
    frente_externa: { ativa: false },
    sub_itens: [],
  }));

  ins.run('componente', 'Cabideiro', JSON.stringify({
    nome: 'Cabideiro',
    cat: 'componente',
    desc: 'Cabideiro tubo oval para roupeiro',
    coef: 0.05,
    dimsAplicaveis: ['L'],
    vars: [],
    varsDeriv: {},
    pecas: [],
    frente_externa: { ativa: false },
    sub_itens: [
      { id: 'caboval', nome: 'Cabideiro Tubo Oval', ferrId: 'cabOval', defaultOn: true, qtdFormula: 'Li/1000' },
    ],
  }));

    console.log('[OK] Catálogo v2 criado: 3 caixas + 5 componentes');
}

// ═══════════════════════════════════════════════════════
// MIGRATION — Porta: adicionar Ap como variável configurável
// ═══════════════════════════════════════════════════════
{
  const portaRow = db.prepare("SELECT id, json_data FROM modulos_custom WHERE tipo_item = 'componente' AND nome = 'Porta'").get();
  if (portaRow) {
    const porta = JSON.parse(portaRow.json_data);
    const jaTemAp = (porta.vars || []).some(v => v.id === 'Ap');
    if (!jaTemAp) {
      porta.vars = [
        ...(porta.vars || []),
        { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
      ];
      // Garante que qtdFormula usa nPortas na contagem de dobradiças
      porta.sub_itens = (porta.sub_itens || []).map(si => {
        if (si.id === 'dob110' || si.id === 'dob165') {
          return { ...si, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' };
        }
        if (si.id === 'puxador') {
          return { ...si, qtdFormula: 'nPortas' };
        }
        return si;
      });
      db.prepare('UPDATE modulos_custom SET json_data = ? WHERE id = ?').run(JSON.stringify(porta), portaRow.id);
      console.log('[OK] Porta: variável Ap (altura) adicionada com qtdFormula de dobradiças');
    }
  }
}

// ═══════════════════════════════════════════════════════
// MIGRATION — dimsAplicaveis: definir dimensões editáveis por componente
// ═══════════════════════════════════════════════════════
{
  const DIMS_MAP = {
    'Gaveta':             ['L', 'P'],
    'Prateleira':         ['L', 'P'],
    'Porta':              ['L'],
    'Divisória Vertical': ['A', 'P'],
    'Cabideiro':          ['L'],
  };

  const rows = db.prepare("SELECT id, nome, json_data FROM modulos_custom WHERE tipo_item = 'componente'").all();
  for (const row of rows) {
    const dims = DIMS_MAP[row.nome];
    if (!dims) continue;
    const data = JSON.parse(row.json_data);
    if (data.dimsAplicaveis) continue; // já migrado
    data.dimsAplicaveis = dims;
    db.prepare('UPDATE modulos_custom SET json_data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    console.log(`[OK] ${row.nome}: dimsAplicaveis = [${dims.join(', ')}]`);
  }
}

// ═══════════════════════════════════════════════════════
// MIGRATION — corrigir dimsAplicaveis: remover dims redundantes com vars próprios
// Porta: Ap já controla altura → só ['L']
// Gaveta: ag já controla altura → só ['L', 'P']
// ═══════════════════════════════════════════════════════
{
  const DIMS_FIX = {
    'Porta':  ['L'],
    'Gaveta': ['L', 'P'],
  };
  for (const [nome, dims] of Object.entries(DIMS_FIX)) {
    const row = db.prepare("SELECT id, json_data FROM modulos_custom WHERE tipo_item = 'componente' AND nome = ?").get(nome);
    if (!row) continue;
    const data = JSON.parse(row.json_data);
    if (JSON.stringify(data.dimsAplicaveis) === JSON.stringify(dims)) continue;
    data.dimsAplicaveis = dims;
    db.prepare('UPDATE modulos_custom SET json_data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    console.log(`[OK] ${nome}: dimsAplicaveis corrigido para [${dims.join(', ')}]`);
  }
}

// ═══════════════════════════════════════════════════════
// SEED v3 — Biblioteca expandida + Catálogo completo
// Baseado em análise de projetos reais (Arauco, Guararapes, Duratex)
// Materiais genéricos 15mm + ferragens + módulos diversos
// ═══════════════════════════════════════════════════════
{
  // ─── Materiais genéricos (chapas 15mm, R$0) ─────────────────────
  const hasMatV3 = db.prepare("SELECT COUNT(*) as c FROM biblioteca WHERE cod = 'amad_medio'").get();
  if (hasMatV3.c === 0) {
    const matIns = db.prepare(
      'INSERT INTO biblioteca (tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2, fita_preco, categoria) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );

    // Chapas genéricas 15mm (preço R$0 — ajuste manual posterior)
    const chapas = [
      ['amad_medio',    'Amadeirado Médio 15mm',   'MDP/MDF Amadeirado Médio (ex: Louro Freijó, Carvalho Malva)'],
      ['amad_claro',    'Amadeirado Claro 15mm',   'MDP/MDF Amadeirado Claro (ex: Areia, Lord, Sal Rosa)'],
      ['amad_escuro',   'Amadeirado Escuro 15mm',  'MDP/MDF Amadeirado Escuro (ex: Nogueira, Gaia)'],
      ['personalizado', 'Personalizado 15mm',       'Material personalizado (ex: Verde Floresta, cores especiais)'],
      ['laca15',        'Laca 15mm',                'MDF para laqueamento (laca PU)'],
      ['branco_ultra',  'Branco TX Ultra 15mm',     'MDP Branco TX Ultra'],
      ['branco_tx15',   'Branco TX 15mm',           'MDP Branco TX'],
      ['preto_tx',      'Preto TX 15mm',            'MDP Preto TX'],
    ];
    for (const [cod, nome, desc] of chapas) {
      matIns.run('material', cod, nome, desc, 'chapa', 0, 15, 2750, 1850, 15, 0, 0, '');
    }

    // Acabamentos extras (encontrados nos projetos)
    const acabamentos = [
      ['palhinha',       'Palhinha Indiana Natural', 'Palhinha natural para portas e detalhes',     'm²', 0],
      ['vidro_incol',    'Vidro Incolor 6mm',        'Vidro temperado incolor para portas',         'm²', 0],
      ['vidro_refbronze','Vidro Reflecta Bronze',    'Vidro reflecta bronze para portas de correr', 'm²', 0],
      ['muxarabi',       'Muxarabi MDF',             'Painel muxarabi decorativo em MDF',           'm²', 0],
    ];
    for (const [cod, nome, desc, un, preco] of acabamentos) {
      const exists = db.prepare('SELECT id FROM biblioteca WHERE cod = ?').get(cod);
      if (!exists) matIns.run('acabamento', cod, nome, desc, un, preco, 0, 0, 0, 0, 0, 0, '');
    }

    // Ferragens extras (genéricas R$0)
    const ferr = [
      ['corrPesada',    'Corrediça Pesada',          'Full extension carga pesada',       'par', 'corrediça'],
      ['articulador',   'Articulador',                'Articulador porta suspensa',        'par', 'articulador'],
      ['trilhoCorrer',  'Trilho Porta de Correr',     'Sistema porta de correr alumínio',  'un',  ''],
      ['supPrat',       'Suporte Prateleira',          'Pino/suporte regulável prateleira', 'un',  ''],
      ['puxSlim',       'Puxador Slim Embutir',        'Puxador slim embutido',             'un',  ''],
      ['puxPonto',      'Puxador Ponto Redondo',       'Puxador ponto redondo',             'un',  ''],
      ['lixeiraDesliz', 'Lixeira Deslizante',          'Lixeira deslizante embutida',       'un',  ''],
      ['perfilLed',     'Perfil de LED',               'Perfil LED alumínio + fita',        'm',   ''],
      ['tipOn',         'Tip-On (Fecho Toque)',        'Mecanismo push-to-open Blum/similar','un',  ''],
    ];
    for (const [cod, nome, desc, un, cat] of ferr) {
      const exists = db.prepare('SELECT id FROM biblioteca WHERE cod = ?').get(cod);
      if (!exists) matIns.run('ferragem', cod, nome, desc, un, 0, 0, 0, 0, 0, 0, 0, cat);
    }

    // Acessórios extras
    const acess = [
      ['metalon2cm', 'Metalon 2cm Dourado Champanhe', 'Tubo metalon para pés, barras e cabideiros', 'm',  0],
      ['divTalheres','Divisória para Talheres',         'Organizador de talheres para gaveta',        'un', 0],
    ];
    for (const [cod, nome, desc, un, preco] of acess) {
      const exists = db.prepare('SELECT id FROM biblioteca WHERE cod = ?').get(cod);
      if (!exists) matIns.run('acessorio', cod, nome, desc, un, preco, 0, 0, 0, 0, 0, 0, '');
    }

    console.log('[OK] Biblioteca v3: chapas genéricas 15mm + acabamentos + ferragens + acessórios');
  }

  // ─── Módulos expandidos (caixas + componentes) ────────────────────
  const hasCatV3 = db.prepare("SELECT COUNT(*) as c FROM modulos_custom WHERE nome = 'Torre Quente'").get();
  if (hasCatV3.c === 0) {
    const ins = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (1, ?, ?, ?)');

    // ── Peças padrão (caixaria completa) ──
    const pecasPadrao = [
      { id: 'le', nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f'] },
      { id: 'ld', nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f'] },
      { id: 'tp', nome: 'Topo',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f'] },
      { id: 'bs', nome: 'Base',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f'] },
      { id: 'fn', nome: 'Fundo',         qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
    ];

    // Variações sem fundo (módulos abertos atrás)
    const pecasSemFundo = pecasPadrao.filter(p => p.id !== 'fn');

    // ── Tamponamentos comuns ──
    const tampFull = [
      { id: 'te', nome: 'Tamp. Lat. Esq.',   face: 'lat_esq', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'td', nome: 'Tamp. Lat. Dir.',   face: 'lat_dir', calc: 'A*P',   mat: 'ext', fita: ['f','b'] },
      { id: 'tt', nome: 'Tamp. Topo',        face: 'topo',    calc: 'L*P',   mat: 'ext', fita: ['f'] },
      { id: 'tb', nome: 'Rodapé/Base Vista', face: 'base',    calc: 'L*100', mat: 'ext', fita: ['f'] },
    ];

    const tampLaterais = [
      { id: 'te', nome: 'Tamp. Lat. Esq.', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f','b'] },
      { id: 'td', nome: 'Tamp. Lat. Dir.', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f','b'] },
    ];

    const tampBalcao = [
      ...tampLaterais,
      { id: 'tb', nome: 'Rodapé', face: 'base', calc: 'L*100', mat: 'ext', fita: ['f'] },
    ];

    const tampAereo = [
      ...tampLaterais,
      { id: 'tb', nome: 'Acab. Inferior', face: 'base', calc: 'L*P', mat: 'ext', fita: ['f'] },
    ];

    // ═══════════════════════════════════════════════════════
    // NOVAS CAIXAS — baseadas em projetos reais analisados
    // ═══════════════════════════════════════════════════════
    const novasCaixas = [
      // ─── COZINHA ───
      {
        nome: 'Torre Quente',
        cat: 'cozinha', desc: 'Torre para forno e micro-ondas embutidos — nicho aberto no meio',
        coef: 0.40,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Nicho Microondas',
        cat: 'cozinha', desc: 'Nicho para microondas embutido em armário suspenso',
        coef: 0.20,
        pecas: pecasSemFundo,
        tamponamentos: tampLaterais,
      },
      {
        nome: 'Nicho Eletro',
        cat: 'cozinha', desc: 'Nicho para eletrodoméstico embutido (bebedouro, cafeteira, etc)',
        coef: 0.22,
        pecas: pecasSemFundo,
        tamponamentos: tampLaterais,
      },
      {
        nome: 'Balcão com Botijão',
        cat: 'cozinha', desc: 'Balcão de cozinha com espaço para botijão de gás e lixeira embutida',
        coef: 0.35,
        pecas: pecasPadrao,
        tamponamentos: tampBalcao,
      },
      {
        nome: 'Ilha / Península',
        cat: 'cozinha', desc: 'Ilha central ou península de cozinha com cooktop e cuba',
        coef: 0.38,
        pecas: pecasPadrao,
        tamponamentos: [
          ...tampLaterais,
          { id: 'tf', nome: 'Tamp. Frontal',  face: 'frontal',  calc: 'L*A', mat: 'ext', fita: ['all'] },
          { id: 'tr', nome: 'Tamp. Traseira', face: 'traseira', calc: 'L*A', mat: 'ext', fita: ['all'] },
          { id: 'tto',nome: 'Tampo Superior',  face: 'topo',     calc: 'L*P', mat: 'ext', fita: ['f'] },
        ],
      },

      // ─── SALA / LIVING ───
      {
        nome: 'Painel TV',
        cat: 'sala', desc: 'Painel para TV — liso ou ripado, com cortes para pontos elétricos',
        coef: 0.25,
        pecas: [
          { id: 'painel', nome: 'Painel',     qtd: 1, calc: 'L*A',  mat: 'int', fita: ['all'] },
          { id: 'prat',   nome: 'Prateleira', qtd: 1, calc: 'L*P',  mat: 'int', fita: ['f'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento Painel', face: 'topo', calc: 'L*A', mat: 'ext', fita: ['all'] },
        ],
      },
      {
        nome: 'Rack TV',
        cat: 'sala', desc: 'Rack suspenso ou apoiado sob painel TV — com portas e nichos',
        coef: 0.28,
        pecas: pecasPadrao,
        tamponamentos: [
          ...tampLaterais,
          { id: 'tt', nome: 'Tampo', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['f'] },
        ],
      },
      {
        nome: 'Aparador / Buffet',
        cat: 'sala', desc: 'Módulo baixo tipo aparador, buffet ou credenza — com portas em palhinha',
        coef: 0.30,
        pecas: pecasPadrao,
        tamponamentos: [
          ...tampLaterais,
          { id: 'tt', nome: 'Tampo Superior', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['f'] },
          { id: 'tb', nome: 'Rodapé',         face: 'base', calc: 'L*100', mat: 'ext', fita: ['f'] },
        ],
      },
      {
        nome: 'Estante / Armário com Nichos',
        cat: 'sala', desc: 'Estante ou armário com nichos abertos e iluminados + portas inferiores',
        coef: 0.32,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Prateleira Avulsa',
        cat: 'generico', desc: 'Prateleira individual fixada na parede — com bordas curvas',
        coef: 0.15,
        pecas: [
          { id: 'prat', nome: 'Prateleira', qtd: 1, calc: 'L*P', mat: 'int', fita: ['f','b'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['all'] },
        ],
      },
      {
        nome: 'Painel Ripado',
        cat: 'sala', desc: 'Painel ripado decorativo (2x2cm, 3x1cm, 4x2cm com 5mm de profundidade)',
        coef: 0.30,
        pecas: [
          { id: 'painel', nome: 'Painel Base', qtd: 1, calc: 'L*A', mat: 'int', fita: [] },
          { id: 'ripas',  nome: 'Ripas',       qtd: 1, calc: 'L*A', mat: 'ext', fita: [] },
        ],
        tamponamentos: [],
      },
      {
        nome: 'Painel de Fechamento',
        cat: 'generico', desc: 'Painel para fechamento (viga, escada, lateral) em L de 3cm',
        coef: 0.20,
        pecas: [
          { id: 'painel', nome: 'Painel', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento', face: 'topo', calc: 'L*A', mat: 'ext', fita: ['all'] },
        ],
      },

      // ─── QUARTO ───
      {
        nome: 'Cabeceira',
        cat: 'quarto', desc: 'Painel cabeceira — ripado, liso ou com muxarabi',
        coef: 0.22,
        pecas: [
          { id: 'painel', nome: 'Painel Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento Cabeceira', face: 'topo', calc: 'L*A', mat: 'ext', fita: ['all'] },
        ],
      },
      {
        nome: 'Cômoda',
        cat: 'quarto', desc: 'Cômoda com gavetas — pés em metalon dourado champanhe',
        coef: 0.28,
        pecas: pecasPadrao,
        tamponamentos: [
          ...tampLaterais,
          { id: 'tt', nome: 'Tampo', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['f'] },
          { id: 'tb', nome: 'Rodapé', face: 'base', calc: 'L*100', mat: 'ext', fita: ['f'] },
        ],
      },
      {
        nome: 'Mesa / Escrivaninha',
        cat: 'quarto', desc: 'Mesa de estudo ou escrivaninha — com bordas curvas e gavetas',
        coef: 0.28,
        pecas: [
          { id: 'tampo', nome: 'Tampo',        qtd: 1, calc: 'L*P',   mat: 'int', fita: ['all'] },
          { id: 'le',    nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int', fita: ['f'] },
          { id: 'ld',    nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int', fita: ['f'] },
          { id: 'fn',    nome: 'Fundo/Costas',  qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
        ],
        tamponamentos: tampLaterais,
      },
      {
        nome: 'Armário Suspenso Quarto',
        cat: 'quarto', desc: 'Armário suspenso para quarto com prateleiras e portas',
        coef: 0.25,
        pecas: pecasPadrao,
        tamponamentos: tampAereo,
      },
      {
        nome: 'Guarda-Roupa',
        cat: 'quarto', desc: 'Guarda-roupa com portas de correr em vidro ou MDF',
        coef: 0.38,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },

      // ─── BANHEIRO ───
      {
        nome: 'Gabinete Banheiro',
        cat: 'banheiro', desc: 'Gabinete para banheiro ou lavabo — com gavetas e prateleira',
        coef: 0.30,
        pecas: pecasPadrao,
        tamponamentos: tampBalcao,
      },
      {
        nome: 'Painel Banheiro',
        cat: 'banheiro', desc: 'Painel decorativo em L com prateleiras — banheiro social',
        coef: 0.22,
        pecas: [
          { id: 'painel', nome: 'Painel', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] },
          { id: 'prat',   nome: 'Prateleira', qtd: 2, calc: 'L*P', mat: 'int', fita: ['f'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento', face: 'topo', calc: 'L*A', mat: 'ext', fita: ['all'] },
        ],
      },
      {
        nome: 'Espelheira',
        cat: 'banheiro', desc: 'Armário espelheira suspenso com portas e prateleiras',
        coef: 0.25,
        pecas: pecasPadrao,
        tamponamentos: tampAereo,
      },

      // ─── CLOSET / ROUPEIRO ───
      {
        nome: 'Armário em L',
        cat: 'closet', desc: 'Armário de canto em L para roupeiro/closet — com cabideiro',
        coef: 0.42,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Coluna / Torre Closet',
        cat: 'closet', desc: 'Coluna estreita tipo torre para closet ou despensa',
        coef: 0.38,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },

      // ─── ÁREA GOURMET ───
      {
        nome: 'Armário da Ilha Gourmet',
        cat: 'gourmet', desc: 'Armário para ilha gourmet com gavetas e portas em palhinha',
        coef: 0.35,
        pecas: pecasPadrao,
        tamponamentos: [
          ...tampLaterais,
          { id: 'tf', nome: 'Tamp. Frontal', face: 'frontal', calc: 'L*A', mat: 'ext', fita: ['all'] },
          { id: 'tto',nome: 'Tampo',          face: 'topo',    calc: 'L*P', mat: 'ext', fita: ['f'] },
        ],
      },
      {
        nome: 'Painel da Viga',
        cat: 'gourmet', desc: 'Revestimento de viga em MDF com frisos nos dois lados',
        coef: 0.20,
        pecas: [
          { id: 'pain1', nome: 'Face Frontal', qtd: 1, calc: 'L*A', mat: 'int', fita: [] },
          { id: 'pain2', nome: 'Face Traseira', qtd: 1, calc: 'L*A', mat: 'int', fita: [] },
          { id: 'base',  nome: 'Base',          qtd: 1, calc: 'L*P', mat: 'int', fita: [] },
        ],
        tamponamentos: [],
      },

      // ─── LAVANDERIA ───
      {
        nome: 'Armário Lavanderia',
        cat: 'lavanderia', desc: 'Armário para área de serviço com prateleiras internas',
        coef: 0.25,
        pecas: pecasPadrao,
        tamponamentos: tampBalcao,
      },

      // ─── HOME OFFICE ───
      {
        nome: 'Home Office / Bancada',
        cat: 'escritorio', desc: 'Bancada de trabalho com prateleiras e gavetas laterais',
        coef: 0.30,
        pecas: [
          { id: 'tampo', nome: 'Tampo',        qtd: 1, calc: 'L*P',   mat: 'int', fita: ['all'] },
          { id: 'le',    nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int', fita: ['f'] },
          { id: 'ld',    nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int', fita: ['f'] },
          { id: 'fn',    nome: 'Fundo/Costas',  qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
        ],
        tamponamentos: tampLaterais,
      },

      // ─── ESPECIAIS ───
      {
        nome: 'Móvel Curvo',
        cat: 'especial', desc: 'Módulo com formas curvas — alta complexidade e avaria',
        coef: 1.00,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Canto (45° / L)',
        cat: 'especial', desc: 'Módulo de canto — 45° ou formato L com corte especial',
        coef: 0.45,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Adega / Wine Bar',
        cat: 'especial', desc: 'Módulo adega ou bar para vinhos com nichos',
        coef: 0.35,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Sapateira',
        cat: 'closet', desc: 'Módulo sapateira com prateleiras inclinadas',
        coef: 0.25,
        pecas: pecasPadrao,
        tamponamentos: tampBalcao,
      },
      {
        nome: 'Geladeira / Forno Embutir',
        cat: 'cozinha', desc: 'Nicho para geladeira ou forno embutido — aberto atrás',
        coef: 0.30,
        pecas: pecasSemFundo,
        tamponamentos: tampLaterais,
      },
      {
        nome: 'Armário Alto',
        cat: 'generico', desc: 'Armário alto tipo roupeiro, despensa ou estante com portas',
        coef: 0.35,
        pecas: pecasPadrao,
        tamponamentos: tampFull,
      },
      {
        nome: 'Nicho Aberto Decorativo',
        cat: 'generico', desc: 'Módulo nicho aberto para decoração — iluminado com LED',
        coef: 0.20,
        pecas: pecasSemFundo,
        tamponamentos: tampLaterais,
      },
      {
        nome: 'Espelho Orgânico',
        cat: 'banheiro', desc: 'Espelho com borda orgânica em MDF — formato irregular',
        coef: 0.30,
        pecas: [
          { id: 'borda', nome: 'Borda MDF', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acabamento Borda', face: 'topo', calc: 'L*A', mat: 'ext', fita: ['all'] },
        ],
      },
      // ─── QUARTO — BASE CAMA ───
      {
        nome: 'Base Cama',
        cat: 'quarto', desc: 'Base de cama com gavetas laterais — estrutura baixa rente ao chão',
        coef: 0.35,
        pecas: [
          { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
          { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
          { id: 'cab', nome: 'Travessa Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
          { id: 'pes', nome: 'Travessa Pés', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
          { id: 'fundo', nome: 'Fundo Base', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
          { id: 'trav_c', nome: 'Travessa Central', qtd: 1, calc: 'L*100', mat: 'int', fita: [] },
          { id: 'div_gav', nome: 'Divisória Gavetas', qtd: 1, calc: 'P*A', mat: 'int', fita: [] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acab. Frontal', face: 'frente', calc: 'L*A', mat: 'ext', fita: ['f','t'] },
          { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'P*A', mat: 'ext', fita: ['f'] },
          { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'P*A', mat: 'ext', fita: ['f'] },
          { id: 'tp', nome: 'Acab. Pés', face: 'tras', calc: 'L*A', mat: 'ext', fita: ['f'] },
        ],
      },
      {
        nome: 'Base Cama com Bicama',
        cat: 'quarto', desc: 'Base de cama com gavetas + bicama deslizante inferior',
        coef: 0.45,
        pecas: [
          { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
          { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
          { id: 'cab', nome: 'Travessa Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
          { id: 'pes', nome: 'Travessa Pés', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
          { id: 'fundo', nome: 'Fundo Base', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
          { id: 'trav_c', nome: 'Travessa Central', qtd: 1, calc: 'L*100', mat: 'int', fita: [] },
          { id: 'div_gav', nome: 'Divisória Gavetas', qtd: 1, calc: 'P*A', mat: 'int', fita: [] },
          { id: 'bi_lat_e', nome: 'Bicama Lat Esq', qtd: 1, calc: 'P*(A*0.4)', mat: 'int', fita: ['f'] },
          { id: 'bi_lat_d', nome: 'Bicama Lat Dir', qtd: 1, calc: 'P*(A*0.4)', mat: 'int', fita: ['f'] },
          { id: 'bi_fundo', nome: 'Bicama Fundo', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
          { id: 'bi_cab', nome: 'Bicama Cabeceira', qtd: 1, calc: 'L*(A*0.4)', mat: 'int', fita: ['f'] },
        ],
        tamponamentos: [
          { id: 'te', nome: 'Acab. Frontal', face: 'frente', calc: 'L*A', mat: 'ext', fita: ['f','t'] },
          { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'P*A', mat: 'ext', fita: ['f'] },
          { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'P*A', mat: 'ext', fita: ['f'] },
          { id: 'tp', nome: 'Acab. Pés', face: 'tras', calc: 'L*A', mat: 'ext', fita: ['f'] },
          { id: 'bi_front', nome: 'Bicama Frontal', face: 'frente', calc: 'L*(A*0.4)', mat: 'ext', fita: ['f','t'] },
        ],
      },
    ];

    for (const cx of novasCaixas) {
      ins.run('caixa', cx.nome, JSON.stringify(cx));
    }

    // ═══════════════════════════════════════════════════════
    // NOVOS COMPONENTES — baseados em projetos reais
    // ═══════════════════════════════════════════════════════
    const novosComps = [
      // ─── PORTAS ───
      {
        nome: 'Porta Ripada',
        cat: 'componente', desc: 'Porta com ripas decorativas (2x2cm ou 3x1cm, 5mm profundidade)',
        coef: 0.20,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Ripada', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador', ferrId: 'pux128', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta com Palhinha',
        cat: 'componente', desc: 'Porta com detalhe em palhinha indiana natural',
        coef: 0.25,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta com Palhinha', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador Ponto', ferrId: 'puxPonto', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta com Friso',
        cat: 'componente', desc: 'Porta lisa com frisos de 5mm — estilo clássico',
        coef: 0.18,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta com Friso', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador Slim', ferrId: 'puxSlim', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta com Vidro',
        cat: 'componente', desc: 'Porta com vidro incolor 6mm temperado',
        coef: 0.25,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta com Vidro', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador Ponto', ferrId: 'puxPonto', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta com Muxarabi',
        cat: 'componente', desc: 'Porta com painel muxarabi decorativo em MDF',
        coef: 0.30,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Muxarabi', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador', ferrId: 'pux128', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta de Correr',
        cat: 'componente', desc: 'Porta de correr com trilho em alumínio — vidro ou MDF',
        coef: 0.22,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 4, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2600, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta de Correr', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'trilho', nome: 'Trilho Porta de Correr', ferrId: 'trilhoCorrer', defaultOn: true, qtdFormula: 'nPortas' },
          { id: 'puxador', nome: 'Puxador', ferrId: 'pux128', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta Basculante',
        cat: 'componente', desc: 'Porta basculante com pistão a gás — aéreos e nichos',
        coef: 0.18,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 1, min: 1, max: 4, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 800, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Basculante', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'pistao', nome: 'Pistão a Gás', ferrId: 'pistGas', defaultOn: true, qtdFormula: 'nPortas*2' },
          { id: 'puxador', nome: 'Puxador Slim', ferrId: 'puxSlim', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta Perfil Alumínio',
        cat: 'componente', desc: 'Porta com perfil de alumínio e vidro — estilo moderno',
        coef: 0.30,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Perfil Alumínio', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador', ferrId: 'pux128', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      {
        nome: 'Porta Provençal',
        cat: 'componente', desc: 'Porta estilo provençal/clássico com molduras',
        coef: 0.28,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Provençal', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'puxador', nome: 'Puxador Ponto', ferrId: 'puxPonto', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },

      // ─── GAVETAS ───
      {
        nome: 'Gavetão',
        cat: 'componente', desc: 'Gaveta grande/profunda com corrediça pesada — para panelas e utensílios',
        coef: 0.25,
        dimsAplicaveis: ['L', 'P'],
        vars: [
          { id: 'ag', label: 'Altura do Gavetão', default: 250, min: 100, max: 600, unit: 'mm' },
        ],
        varsDeriv: { Lg: 'Li', Pg: 'P-50' },
        pecas: [
          { id: 'lat_e', nome: 'Lateral Esq.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
          { id: 'lat_d', nome: 'Lateral Dir.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
          { id: 'base',  nome: 'Base',           qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: [] },
          { id: 'fnd',   nome: 'Fundo',          qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: [] },
          { id: 'fi',    nome: 'Frente Interna', qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: ['all'] },
        ],
        frente_externa: { ativa: true, id: 'fe', nome: 'Frente Externa', calc: 'Lg*ag', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'corrPesada', nome: 'Corrediça Pesada', ferrId: 'corrPesada', defaultOn: true },
          { id: 'puxador', nome: 'Puxador', ferrId: 'pux160', defaultOn: true },
        ],
      },
      {
        nome: 'Gaveta Organizadora',
        cat: 'componente', desc: 'Gaveta com divisórias internas para talheres e utensílios',
        coef: 0.22,
        dimsAplicaveis: ['L', 'P'],
        vars: [
          { id: 'ag', label: 'Altura da Gaveta', default: 120, min: 60, max: 250, unit: 'mm' },
        ],
        varsDeriv: { Lg: 'Li', Pg: 'P-50' },
        pecas: [
          { id: 'lat_e', nome: 'Lateral Esq.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
          { id: 'lat_d', nome: 'Lateral Dir.',   qtd: 1, calc: 'Pg*ag', mat: 'int',   fita: ['t','b','f'] },
          { id: 'base',  nome: 'Base',           qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: [] },
          { id: 'fnd',   nome: 'Fundo',          qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: [] },
          { id: 'fi',    nome: 'Frente Interna', qtd: 1, calc: 'Lg*ag', mat: 'int',   fita: ['all'] },
        ],
        frente_externa: { ativa: true, id: 'fe', nome: 'Frente Externa', calc: 'Lg*ag', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'corrNorm', nome: 'Corrediça Normal', ferrId: 'corr400', defaultOn: true },
          { id: 'divTalh',  nome: 'Divisória Talheres', ferrId: 'divTalheres', defaultOn: true },
          { id: 'puxador',  nome: 'Puxador Slim', ferrId: 'puxSlim', defaultOn: true },
        ],
      },

      // ─── PRATELEIRAS ───
      {
        nome: 'Prateleira com LED',
        cat: 'componente', desc: 'Prateleira com perfil de LED embutido — iluminação indireta',
        coef: 0.12,
        dimsAplicaveis: ['L', 'P'],
        vars: [],
        varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
        pecas: [
          { id: 'prat', nome: 'Prateleira', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['f'] },
        ],
        frente_externa: { ativa: false },
        sub_itens: [
          { id: 'suporte', nome: 'Suporte de Prateleira', ferrId: 'supPrat', defaultOn: true, qtdFormula: '4' },
          { id: 'led', nome: 'Perfil LED', ferrId: 'perfilLed', defaultOn: true, qtdFormula: 'Lpr/1000' },
        ],
      },
      {
        nome: 'Prateleira Borda Curva',
        cat: 'componente', desc: 'Prateleira com bordas curvas arredondadas — estilo orgânico',
        coef: 0.08,
        dimsAplicaveis: ['L', 'P'],
        vars: [],
        varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
        pecas: [
          { id: 'prat', nome: 'Prateleira Borda Curva', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['all'] },
        ],
        frente_externa: { ativa: false },
        sub_itens: [
          { id: 'suporte', nome: 'Suporte Prateleira', ferrId: 'supPrat', defaultOn: true, qtdFormula: '4' },
        ],
      },

      // ─── OUTROS COMPONENTES ───
      {
        nome: 'Nicho Aberto',
        cat: 'componente', desc: 'Nicho aberto sem porta — decorativo ou funcional',
        coef: 0.08,
        dimsAplicaveis: ['L', 'A'],
        vars: [],
        varsDeriv: { Ln: 'Li', Pn: 'Pi' },
        pecas: [
          { id: 'prat', nome: 'Prateleira Nicho', qtd: 1, calc: 'Ln*Pn', mat: 'int', fita: ['f'] },
        ],
        frente_externa: { ativa: false },
        sub_itens: [],
      },
      {
        nome: 'Nicho Iluminado',
        cat: 'componente', desc: 'Nicho aberto com perfil de LED embutido na parte superior',
        coef: 0.12,
        dimsAplicaveis: ['L', 'A'],
        vars: [],
        varsDeriv: { Ln: 'Li', Pn: 'Pi' },
        pecas: [
          { id: 'prat', nome: 'Prateleira Nicho', qtd: 1, calc: 'Ln*Pn', mat: 'int', fita: ['f'] },
        ],
        frente_externa: { ativa: false },
        sub_itens: [
          { id: 'led', nome: 'Perfil LED', ferrId: 'perfilLed', defaultOn: true, qtdFormula: 'Ln/1000' },
        ],
      },
      {
        nome: 'Maleiro',
        cat: 'componente', desc: 'Compartimento superior com porta basculante — para malas e edredons',
        coef: 0.15,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'Am', label: 'Altura do Maleiro', default: 400, min: 200, max: 600, unit: 'mm' },
        ],
        varsDeriv: { Lm: 'Li', Pm: 'Pi' },
        pecas: [
          { id: 'base_m', nome: 'Base Maleiro', qtd: 1, calc: 'Lm*Pm', mat: 'int', fita: ['f'] },
        ],
        frente_externa: { ativa: true, id: 'porta_m', nome: 'Porta Maleiro', calc: 'Lm*Am', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'pistao', nome: 'Pistão a Gás', ferrId: 'pistGas', defaultOn: true, qtdFormula: '2' },
        ],
      },
      {
        nome: 'Lixeira Deslizante',
        cat: 'componente', desc: 'Lixeira deslizante embutida em porta de armário',
        coef: 0.10,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 900, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Lixeira', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'Ap<=900?2:3' },
          { id: 'lixeira', nome: 'Lixeira Deslizante', ferrId: 'lixeiraDesliz', defaultOn: true },
        ],
      },
      // ─── PORTA FECHO TOQUE (push-to-open) ───
      {
        nome: 'Porta Fecho Toque',
        cat: 'componente', desc: 'Porta push-to-open sem puxador — abertura por toque/pressão',
        coef: 0.18,
        dimsAplicaveis: ['L'],
        vars: [
          { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
          { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
        ],
        varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
        pecas: [],
        frente_externa: { ativa: true, id: 'porta', nome: 'Porta Fecho Toque', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
        sub_itens: [
          { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
          { id: 'tipOn', nome: 'Tip-On (Fecho Toque)', ferrId: 'tipOn', defaultOn: true, qtdFormula: 'nPortas' },
        ],
      },
      // ─── CABECEIRA ESTOFADA ───
      {
        nome: 'Cabeceira Estofada',
        cat: 'componente', desc: 'Painel cabeceira com estrutura MDF e revestimento estofado (espuma + tecido/couro)',
        coef: 0.30,
        dimsAplicaveis: ['L','A'],
        vars: [
          { id: 'Lc', label: 'Largura Cabeceira (mm)', default: 0, min: 500, max: 4000, unit: 'mm' },
          { id: 'Ac', label: 'Altura Cabeceira (mm)', default: 0, min: 400, max: 1800, unit: 'mm' },
        ],
        varsDeriv: { Lc: 'L', Ac: 'A' },
        pecas: [
          { id: 'base_mdf', nome: 'Base MDF Cabeceira', qtd: 1, calc: 'Lc*Ac', mat: 'int', fita: [] },
          { id: 'borda_sup', nome: 'Borda Superior', qtd: 1, calc: 'Lc*60', mat: 'int', fita: ['f'] },
          { id: 'borda_lat', nome: 'Bordas Laterais', qtd: 2, calc: 'Ac*60', mat: 'int', fita: ['f'] },
        ],
        frente_externa: null,
        sub_itens: [
          { id: 'supPrat', nome: 'Suporte Parede', ferrId: 'supPrat', defaultOn: true, qtdFormula: 'Lc<=1500?2:Lc<=2500?3:4' },
        ],
      },
    ];

    for (const comp of novosComps) {
      ins.run('componente', comp.nome, JSON.stringify(comp));
    }

    console.log(`[OK] Catálogo v3: ${novasCaixas.length} caixas + ${novosComps.length} componentes adicionados`);
  }

  // ─── SEED v3.1 — Itens incrementais (Base Cama, Porta Fecho Toque, Cabeceira Estofada, Tip-On) ───
  {
    const hasBaseCama = db.prepare("SELECT COUNT(*) as c FROM modulos_custom WHERE nome = 'Base Cama'").get();
    if (hasBaseCama.c === 0) {
      const ins = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (1, ?, ?, ?)');

      const caixasV31 = [
        {
          nome: 'Base Cama',
          cat: 'quarto', desc: 'Base de cama com gavetas laterais — estrutura baixa rente ao chão',
          coef: 0.35,
          pecas: [
            { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
            { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
            { id: 'cab', nome: 'Travessa Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'pes', nome: 'Travessa Pés', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'fundo', nome: 'Fundo Base', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
            { id: 'trav_c', nome: 'Travessa Central', qtd: 1, calc: 'L*100', mat: 'int', fita: [] },
            { id: 'div_gav', nome: 'Divisória Gavetas', qtd: 1, calc: 'P*A', mat: 'int', fita: [] },
          ],
          tamponamentos: [
            { id: 'te', nome: 'Acab. Frontal', face: 'frente', calc: 'L*A', mat: 'ext', fita: ['f','t'] },
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'P*A', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'P*A', mat: 'ext', fita: ['f'] },
            { id: 'tp', nome: 'Acab. Pés', face: 'tras', calc: 'L*A', mat: 'ext', fita: ['f'] },
          ],
        },
        {
          nome: 'Base Cama com Bicama',
          cat: 'quarto', desc: 'Base de cama com gavetas + bicama deslizante inferior',
          coef: 0.45,
          pecas: [
            { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
            { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'P*A', mat: 'int', fita: ['f'] },
            { id: 'cab', nome: 'Travessa Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'pes', nome: 'Travessa Pés', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'fundo', nome: 'Fundo Base', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
            { id: 'trav_c', nome: 'Travessa Central', qtd: 1, calc: 'L*100', mat: 'int', fita: [] },
            { id: 'div_gav', nome: 'Divisória Gavetas', qtd: 1, calc: 'P*A', mat: 'int', fita: [] },
            { id: 'bi_lat_e', nome: 'Bicama Lat Esq', qtd: 1, calc: 'P*(A*0.4)', mat: 'int', fita: ['f'] },
            { id: 'bi_lat_d', nome: 'Bicama Lat Dir', qtd: 1, calc: 'P*(A*0.4)', mat: 'int', fita: ['f'] },
            { id: 'bi_fundo', nome: 'Bicama Fundo', qtd: 1, calc: 'L*P', mat: 'fundo', fita: [] },
            { id: 'bi_cab', nome: 'Bicama Cabeceira', qtd: 1, calc: 'L*(A*0.4)', mat: 'int', fita: ['f'] },
          ],
          tamponamentos: [
            { id: 'te', nome: 'Acab. Frontal', face: 'frente', calc: 'L*A', mat: 'ext', fita: ['f','t'] },
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'P*A', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'P*A', mat: 'ext', fita: ['f'] },
            { id: 'tp', nome: 'Acab. Pés', face: 'tras', calc: 'L*A', mat: 'ext', fita: ['f'] },
            { id: 'bi_front', nome: 'Bicama Frontal', face: 'frente', calc: 'L*(A*0.4)', mat: 'ext', fita: ['f','t'] },
          ],
        },
      ];

      for (const cx of caixasV31) {
        ins.run('caixa', cx.nome, JSON.stringify(cx));
      }

      const compsV31 = [
        {
          nome: 'Porta Fecho Toque',
          cat: 'componente', desc: 'Porta push-to-open sem puxador — abertura por toque/pressão',
          coef: 0.18,
          dimsAplicaveis: ['L'],
          vars: [
            { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 6, unit: 'un' },
            { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 100, max: 2400, unit: 'mm' },
          ],
          varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
          pecas: [],
          frente_externa: { ativa: true, id: 'porta', nome: 'Porta Fecho Toque', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
          sub_itens: [
            { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
            { id: 'tipOn', nome: 'Tip-On (Fecho Toque)', ferrId: 'tipOn', defaultOn: true, qtdFormula: 'nPortas' },
          ],
        },
        {
          nome: 'Cabeceira Estofada',
          cat: 'componente', desc: 'Painel cabeceira com estrutura MDF e revestimento estofado (espuma + tecido/couro)',
          coef: 0.30,
          dimsAplicaveis: ['L','A'],
          vars: [
            { id: 'Lc', label: 'Largura Cabeceira (mm)', default: 0, min: 500, max: 4000, unit: 'mm' },
            { id: 'Ac', label: 'Altura Cabeceira (mm)', default: 0, min: 400, max: 1800, unit: 'mm' },
          ],
          varsDeriv: { Lc: 'L', Ac: 'A' },
          pecas: [
            { id: 'base_mdf', nome: 'Base MDF Cabeceira', qtd: 1, calc: 'Lc*Ac', mat: 'int', fita: [] },
            { id: 'borda_sup', nome: 'Borda Superior', qtd: 1, calc: 'Lc*60', mat: 'int', fita: ['f'] },
            { id: 'borda_lat', nome: 'Bordas Laterais', qtd: 2, calc: 'Ac*60', mat: 'int', fita: ['f'] },
          ],
          frente_externa: null,
          sub_itens: [
            { id: 'supPrat', nome: 'Suporte Parede', ferrId: 'supPrat', defaultOn: true, qtdFormula: 'Lc<=1500?2:Lc<=2500?3:4' },
          ],
        },
      ];

      for (const comp of compsV31) {
        ins.run('componente', comp.nome, JSON.stringify(comp));
      }

      console.log('[OK] Catálogo v3.1: 2 caixas (Base Cama) + 2 componentes (Porta Fecho Toque, Cabeceira Estofada) adicionados');
    }

    // Ferragem Tip-On
    const hasTipOn = db.prepare("SELECT id FROM biblioteca WHERE cod = 'tipOn'").get();
    if (!hasTipOn) {
      db.prepare('INSERT INTO biblioteca (tipo, cod, nome, descricao, unidade, largura, altura, espessura, preco, preco_m2, ativo) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 1)').run('ferragem', 'tipOn', 'Tip-On (Fecho Toque)', 'Mecanismo push-to-open Blum/similar', 'un');
      console.log('[OK] Ferragem Tip-On adicionada');
    }
  }

  // ─── SEED v3.2 — Forro, Cristaleira, Beliche, Despenseiro + componentes + ferragens ───
  {
    const hasForro = db.prepare("SELECT COUNT(*) as c FROM modulos_custom WHERE nome = 'Forro MDF'").get();
    if (hasForro.c === 0) {
      const ins = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (1, ?, ?, ?)');
      const bibIns = db.prepare('INSERT INTO biblioteca (tipo, cod, nome, descricao, unidade, largura, altura, espessura, preco, preco_m2, ativo) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 1)');

      // ═══ NOVAS FERRAGENS / ACABAMENTOS ═══
      const novasFerragens = [
        ['puxCava',     'ferragem',   'Puxador Cava (Usinado)', 'Puxador cava 45° usinado no próprio MDF',       'un'],
        ['corrOculta',  'ferragem',   'Corrediça Oculta',       'Corrediça oculta/telescópica soft-close',        'par'],
      ];
      for (const [cod, tipo, nome, desc, un] of novasFerragens) {
        const exists = db.prepare('SELECT id FROM biblioteca WHERE cod = ?').get(cod);
        if (!exists) bibIns.run(tipo, cod, nome, desc, un);
      }

      const novosAcab = [
        ['vidro_refprata', 'acabamento', 'Vidro Reflecta Prata',  'Vidro reflecta prata 4mm', 'm2'],
        ['vidro_espelho',  'acabamento', 'Espelho Prata Comum',   'Espelho prata comum colado em MDF', 'm2'],
      ];
      for (const [cod, tipo, nome, desc, un] of novosAcab) {
        const exists = db.prepare('SELECT id FROM biblioteca WHERE cod = ?').get(cod);
        if (!exists) bibIns.run(tipo, cod, nome, desc, un);
      }

      // ═══ NOVAS CAIXAS ═══
      const caixasV32 = [
        // ─── FORRO ───
        {
          nome: 'Forro MDF',
          cat: 'especial', desc: 'Forro em painéis de MDF — fixado em réguas na estrutura do teto',
          coef: 0.25,
          pecas: [
            { id: 'painel', nome: 'Painel Forro', qtd: 1, calc: 'L*P', mat: 'int', fita: [] },
            { id: 'regua1', nome: 'Régua Suporte 1', qtd: 1, calc: 'L*60', mat: 'int', fita: ['f'] },
            { id: 'regua2', nome: 'Régua Suporte 2', qtd: 1, calc: 'L*60', mat: 'int', fita: ['f'] },
          ],
          tamponamentos: [
            { id: 'te', nome: 'Acab. Borda Frontal', face: 'frente', calc: 'L*60', mat: 'ext', fita: ['f'] },
          ],
        },
        // ─── CRISTALEIRA ───
        {
          nome: 'Cristaleira',
          cat: 'sala', desc: 'Cristaleira com portas de vidro e prateleiras internas — estilo vitrine',
          coef: 0.40,
          pecas: [
            { id: 'le', nome: 'Lateral Esq.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'ld', nome: 'Lateral Dir.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'tp', nome: 'Topo',         qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'bs', nome: 'Base',         qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'fn', nome: 'Fundo',        qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
            { id: 'prat', nome: 'Prateleiras', qtd: 3, calc: 'Li*Pi', mat: 'int', fita: ['f'] },
          ],
          tamponamentos: [
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tt', nome: 'Acab. Topo', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['f'] },
            { id: 'tb', nome: 'Rodapé', face: 'base', calc: 'L*100', mat: 'ext', fita: ['f'] },
          ],
        },
        // ─── BELICHE / MEZZANINE ───
        {
          nome: 'Beliche / Mezzanine',
          cat: 'quarto', desc: 'Beliche ou mezzanine em MDF — cama elevada com espaço inferior livre',
          coef: 0.55,
          pecas: [
            { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'cab', nome: 'Cabeceira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'pes', nome: 'Peseira', qtd: 1, calc: 'L*A', mat: 'int', fita: ['f'] },
            { id: 'estrado', nome: 'Estrado/Base', qtd: 1, calc: 'L*P', mat: 'int', fita: [] },
            { id: 'guard', nome: 'Grade Proteção', qtd: 1, calc: 'L*300', mat: 'int', fita: ['f','t'] },
            { id: 'trav_e', nome: 'Travessa Estrutural', qtd: 2, calc: 'P*150', mat: 'int', fita: [] },
          ],
          tamponamentos: [
            { id: 'te', nome: 'Acab. Frontal', face: 'frente', calc: 'L*A', mat: 'ext', fita: ['f'] },
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tp', nome: 'Acab. Traseiro', face: 'tras', calc: 'L*A', mat: 'ext', fita: ['f'] },
          ],
        },
        // ─── ESCADA MDF (para beliche/mezzanine) ───
        {
          nome: 'Escada MDF',
          cat: 'quarto', desc: 'Escada em MDF para beliche/mezzanine — degraus fixos laterais',
          coef: 0.30,
          pecas: [
            { id: 'lat_e', nome: 'Lateral Esq', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'lat_d', nome: 'Lateral Dir', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'deg', nome: 'Degraus', qtd: 5, calc: 'Li*P', mat: 'int', fita: ['f'] },
          ],
          tamponamentos: [
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f'] },
          ],
        },
        // ─── DESPENSEIRO ───
        {
          nome: 'Despenseiro',
          cat: 'cozinha', desc: 'Armário alto tipo despenseiro com portas de giro e prateleiras — inclui espaço para gás',
          coef: 0.38,
          pecas: [
            { id: 'le', nome: 'Lateral Esq.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'ld', nome: 'Lateral Dir.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'tp', nome: 'Topo', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'bs', nome: 'Base', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'fn', nome: 'Fundo', qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
            { id: 'prat', nome: 'Prateleiras', qtd: 4, calc: 'Li*Pi', mat: 'int', fita: ['f'] },
            { id: 'div', nome: 'Divisória Central', qtd: 1, calc: 'Ai*Pi', mat: 'int', fita: ['f'] },
          ],
          tamponamentos: [
            { id: 'tl', nome: 'Acab. Lateral Esq', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tr', nome: 'Acab. Lateral Dir', face: 'lat_dir', calc: 'A*P', mat: 'ext', fita: ['f'] },
            { id: 'tt', nome: 'Acab. Topo', face: 'topo', calc: 'L*P', mat: 'ext', fita: ['f'] },
            { id: 'tb', nome: 'Rodapé', face: 'base', calc: 'L*100', mat: 'ext', fita: ['f'] },
          ],
        },
      ];

      for (const cx of caixasV32) {
        ins.run('caixa', cx.nome, JSON.stringify(cx));
      }

      // ═══ NOVOS COMPONENTES ═══
      const compsV32 = [
        // ─── GAVETA BASCULANTE ───
        {
          nome: 'Gaveta Basculante',
          cat: 'componente', desc: 'Gaveta com abertura basculante (tomba para frente) — usa pistão a gás',
          coef: 0.15,
          dimsAplicaveis: ['L'],
          vars: [
            { id: 'Ag', label: 'Altura da Gaveta (mm)', default: 200, min: 100, max: 500, unit: 'mm' },
          ],
          varsDeriv: { Lg: 'Li', Ag: 'A', Pg: 'Pi' },
          pecas: [
            { id: 'frente', nome: 'Frente Basculante', qtd: 1, calc: 'Lg*Ag', mat: 'int', fita: ['all'] },
            { id: 'fundo_g', nome: 'Fundo Gaveta', qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: [] },
          ],
          frente_externa: { ativa: true, id: 'frente_basc', nome: 'Frente Basculante', calc: 'Lg*Ag', mat: 'ext_comp', fita: ['all'] },
          sub_itens: [
            { id: 'pistao', nome: 'Pistão a Gás', ferrId: 'pistGas', defaultOn: true, qtdFormula: '2' },
          ],
        },
        // ─── SAPATEIRA INTERNA (componente) ───
        {
          nome: 'Sapateira Interna',
          cat: 'componente', desc: 'Módulo interno sapateira com corrediça telescópica — bandeja inclinada',
          coef: 0.12,
          dimsAplicaveis: ['L'],
          vars: [
            { id: 'nBand', label: 'Nº Bandejas', default: 3, min: 1, max: 8, unit: 'un' },
          ],
          varsDeriv: { Ls: 'Li', Ps: 'Pi' },
          pecas: [
            { id: 'band', nome: 'Bandeja Sapateira', qtd: 1, calc: 'nBand*(Ls*Ps)', mat: 'int', fita: ['f'] },
            { id: 'borda', nome: 'Borda Frontal', qtd: 1, calc: 'nBand*(Ls*50)', mat: 'int', fita: ['f'] },
          ],
          frente_externa: null,
          sub_itens: [
            { id: 'corrOculta', nome: 'Corrediça Oculta', ferrId: 'corrOculta', defaultOn: true, qtdFormula: 'nBand' },
          ],
        },
        // ─── PORTA DE CORRER COM ESPELHO ───
        {
          nome: 'Porta de Correr com Espelho',
          cat: 'componente', desc: 'Porta de correr com frente em espelho prata colado — comum em roupeiros',
          coef: 0.25,
          dimsAplicaveis: ['L'],
          vars: [
            { id: 'nPortas', label: 'Número de Portas', default: 2, min: 1, max: 4, unit: 'un' },
            { id: 'Ap', label: 'Altura da Porta (mm)', default: 0, min: 500, max: 2600, unit: 'mm' },
          ],
          varsDeriv: { Lp: 'L/nPortas+30', Ap: 'A' },
          pecas: [
            { id: 'base_porta', nome: 'Base MDF da Porta', qtd: 1, calc: 'nPortas*(Lp*Ap)', mat: 'int', fita: ['all'] },
          ],
          frente_externa: null,
          sub_itens: [
            { id: 'trilho', nome: 'Trilho de Correr', ferrId: 'trilhoCorrer', defaultOn: true, qtdFormula: '1' },
          ],
        },
      ];

      for (const comp of compsV32) {
        ins.run('componente', comp.nome, JSON.stringify(comp));
      }

      console.log('[OK] Catálogo v3.2: 5 caixas + 3 componentes + 4 materiais/ferragens adicionados');
    }
  }
}

export default db;
