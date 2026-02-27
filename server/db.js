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
    console.log(`✓ Numeração retroativa: ${semNumero.length} orçamento(s) numerado(s)`);
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
  console.log('✓ Config taxas padrão criada');
}

// Seed clientes de exemplo
const clientCount = db.prepare('SELECT COUNT(*) as c FROM clientes').get();
if (clientCount.c === 0) {
  const adminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (adminUser) {
    db.prepare('INSERT INTO clientes (user_id, nome, tel, email, arq, cidade) VALUES (?, ?, ?, ?, ?, ?)').run(adminUser.id, 'Maria Silva', '(98)99999-1111', 'maria@email.com', '', 'São Luís');
    db.prepare('INSERT INTO clientes (user_id, nome, tel, email, arq, cidade) VALUES (?, ?, ?, ?, ?, ?)').run(adminUser.id, 'João Santos', '(98)99999-2222', 'joao@email.com', 'Arq. Ana Costa', 'São Luís');
    console.log('✓ Clientes de exemplo criados');
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
  ins.run('componente', 'cabOval', 'Cabideiro Tubo Oval', 'Tubo oval para roupeiro', 'm', 18.90, 0, 0, 0, 0, 0);
  ins.run('componente', 'sapReg', 'Sapateira Regulável', '', 'un', 45.90, 0, 0, 0, 0, 0);
  ins.run('componente', 'cestoAr', 'Cesto Aramado', '', 'un', 65.90, 0, 0, 0, 0, 0);
  ins.run('material', 'fita_pvc', 'Fita de Borda PVC', 'Fita de borda 22mm', 'm', 0.85, 0, 0, 0, 0, 0);
  console.log('✓ Biblioteca inicial criada');
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

    console.log('✓ Catálogo v2 criado: 3 caixas + 5 componentes');
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
      console.log('✓ Porta: variável Ap (altura) adicionada com qtdFormula de dobradiças');
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
    console.log(`✓ ${row.nome}: dimsAplicaveis = [${dims.join(', ')}]`);
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
    console.log(`✓ ${nome}: dimsAplicaveis corrigido para [${dims.join(', ')}]`);
  }
}

export default db;
