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

  CREATE TABLE IF NOT EXISTS proposta_section_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acesso_id INTEGER NOT NULL REFERENCES proposta_acessos(id),
    orc_id INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    section_nome TEXT DEFAULT '',
    tempo_visivel INTEGER DEFAULT 0,
    entrou_viewport INTEGER DEFAULT 0,
    UNIQUE(acesso_id, section_id)
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
// CNC — Produção CNC (Plano de Corte, Nesting, G-code)
// ═══════════════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS cnc_lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    cliente TEXT DEFAULT '',
    projeto TEXT DEFAULT '',
    codigo TEXT DEFAULT '',
    vendedor TEXT DEFAULT '',
    json_original TEXT DEFAULT '',
    status TEXT DEFAULT 'importado',
    total_pecas INTEGER DEFAULT 0,
    total_chapas INTEGER DEFAULT 0,
    aproveitamento REAL DEFAULT 0,
    plano_json TEXT DEFAULT '',
    grupo_otimizacao INTEGER DEFAULT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    persistent_id TEXT DEFAULT '',
    upmcode TEXT DEFAULT '',
    descricao TEXT DEFAULT '',
    modulo_desc TEXT DEFAULT '',
    modulo_id INTEGER DEFAULT 0,
    produto_final TEXT DEFAULT '',
    material TEXT DEFAULT '',
    material_code TEXT DEFAULT '',
    espessura REAL DEFAULT 0,
    comprimento REAL DEFAULT 0,
    largura REAL DEFAULT 0,
    quantidade INTEGER DEFAULT 1,
    borda_dir TEXT DEFAULT '',
    borda_esq TEXT DEFAULT '',
    borda_frontal TEXT DEFAULT '',
    borda_traseira TEXT DEFAULT '',
    acabamento TEXT DEFAULT '',
    upmdraw TEXT DEFAULT '',
    usi_a TEXT DEFAULT '',
    usi_b TEXT DEFAULT '',
    machining_json TEXT DEFAULT '{}',
    observacao TEXT DEFAULT '',
    chapa_idx INTEGER DEFAULT NULL,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    rotacionada INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_chapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    material_code TEXT DEFAULT '',
    espessura_nominal REAL DEFAULT 18,
    espessura_real REAL DEFAULT 18.5,
    comprimento REAL DEFAULT 2750,
    largura REAL DEFAULT 1850,
    refilo REAL DEFAULT 10,
    veio TEXT DEFAULT 'sem_veio',
    kerf REAL DEFAULT 4,
    preco REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_retalhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    chapa_ref_id INTEGER REFERENCES cnc_chapas(id),
    nome TEXT DEFAULT '',
    material_code TEXT DEFAULT '',
    espessura_real REAL DEFAULT 0,
    comprimento REAL DEFAULT 0,
    largura REAL DEFAULT 0,
    origem_lote TEXT DEFAULT '',
    disponivel INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_maquinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    fabricante TEXT DEFAULT '',
    modelo TEXT DEFAULT '',
    tipo_pos TEXT DEFAULT 'generic',
    extensao_arquivo TEXT DEFAULT '.nc',
    -- Área de trabalho
    x_max REAL DEFAULT 2800,
    y_max REAL DEFAULT 1900,
    z_max REAL DEFAULT 200,
    -- Pós-processador: cabeçalho e rodapé
    gcode_header TEXT DEFAULT '%\nM71 M10 G90 G00 G54 G17',
    gcode_footer TEXT DEFAULT 'G0 Z200.000\nG40 M5 M74 M72 M11\nG0 X500.000 Y2000.000\nM141 M30\n%',
    -- Velocidades
    z_seguro REAL DEFAULT 30,
    vel_vazio REAL DEFAULT 20000,
    vel_corte REAL DEFAULT 4000,
    vel_aproximacao REAL DEFAULT 8000,
    rpm_padrao INTEGER DEFAULT 12000,
    profundidade_extra REAL DEFAULT 0.20,
    -- Coordenadas
    coordenada_zero TEXT DEFAULT 'canto_esq_inf',
    trocar_eixos_xy INTEGER DEFAULT 0,
    eixo_x_invertido INTEGER DEFAULT 0,
    eixo_y_invertido INTEGER DEFAULT 0,
    -- Exportações
    exportar_lado_a INTEGER DEFAULT 1,
    exportar_lado_b INTEGER DEFAULT 1,
    exportar_furos INTEGER DEFAULT 1,
    exportar_rebaixos INTEGER DEFAULT 1,
    exportar_usinagens INTEGER DEFAULT 1,
    -- Formato de saída
    usar_ponto_decimal INTEGER DEFAULT 1,
    casas_decimais INTEGER DEFAULT 3,
    comentario_prefixo TEXT DEFAULT ';',
    troca_ferramenta_cmd TEXT DEFAULT 'M6',
    spindle_on_cmd TEXT DEFAULT 'M3',
    spindle_off_cmd TEXT DEFAULT 'M5',
    -- Anti-arrasto (peças pequenas)
    usar_onion_skin INTEGER DEFAULT 1,
    onion_skin_espessura REAL DEFAULT 0.5,
    onion_skin_area_max REAL DEFAULT 500,
    usar_tabs INTEGER DEFAULT 0,         -- Desativado por padrão: tabs quebram melamina em MDF
    tab_largura REAL DEFAULT 4,
    tab_altura REAL DEFAULT 1.5,
    tab_qtd INTEGER DEFAULT 2,
    tab_area_max REAL DEFAULT 800,
    usar_lead_in INTEGER DEFAULT 1,
    lead_in_tipo TEXT DEFAULT 'arco',
    lead_in_raio REAL DEFAULT 5,
    feed_rate_pct_pequenas REAL DEFAULT 50,
    feed_rate_area_max REAL DEFAULT 500,
    -- Status
    padrao INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_ferramentas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    maquina_id INTEGER REFERENCES cnc_maquinas(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'broca',
    diametro REAL DEFAULT 0,
    profundidade_max REAL DEFAULT 30,
    doc REAL DEFAULT NULL,
    profundidade_extra REAL DEFAULT NULL,
    tipo_corte TEXT DEFAULT 'broca',
    comprimento_util REAL DEFAULT 25,
    num_cortes INTEGER DEFAULT 2,
    velocidade_corte REAL DEFAULT 4000,
    rpm INTEGER DEFAULT 12000,
    tool_code TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_usinagem_tipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    categoria_match TEXT DEFAULT '',
    diametro_match REAL DEFAULT NULL,
    prioridade INTEGER DEFAULT 5,
    fase TEXT DEFAULT 'interna',
    tool_code_padrao TEXT DEFAULT '',
    profundidade_padrao REAL DEFAULT NULL,
    largura_padrao REAL DEFAULT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cnc_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    user_id INTEGER REFERENCES users(id),
    espaco_pecas REAL DEFAULT 7,
    kerf_padrao REAL DEFAULT 4,
    usar_guilhotina INTEGER DEFAULT 1,
    usar_retalhos INTEGER DEFAULT 1,
    iteracoes_otimizador INTEGER DEFAULT 300,
    peca_min_largura REAL DEFAULT 200,
    peca_min_comprimento REAL DEFAULT 200,
    considerar_sobra INTEGER DEFAULT 1,
    sobra_min_largura REAL DEFAULT 300,
    sobra_min_comprimento REAL DEFAULT 600,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Config de etiquetas (personalização)
  CREATE TABLE IF NOT EXISTS cnc_etiqueta_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    user_id INTEGER REFERENCES users(id),
    -- Formato
    formato TEXT DEFAULT '100x70',
    orientacao TEXT DEFAULT 'paisagem',
    colunas_impressao INTEGER DEFAULT 2,
    margem_pagina REAL DEFAULT 8,
    gap_etiquetas REAL DEFAULT 4,
    -- Campos visíveis (1=mostrar, 0=ocultar)
    mostrar_usia INTEGER DEFAULT 1,
    mostrar_usib INTEGER DEFAULT 1,
    mostrar_material INTEGER DEFAULT 1,
    mostrar_espessura INTEGER DEFAULT 1,
    mostrar_cliente INTEGER DEFAULT 1,
    mostrar_projeto INTEGER DEFAULT 1,
    mostrar_codigo INTEGER DEFAULT 1,
    mostrar_modulo INTEGER DEFAULT 1,
    mostrar_peca INTEGER DEFAULT 1,
    mostrar_dimensoes INTEGER DEFAULT 1,
    mostrar_bordas_diagrama INTEGER DEFAULT 1,
    mostrar_fita_resumo INTEGER DEFAULT 1,
    mostrar_acabamento INTEGER DEFAULT 1,
    mostrar_id_modulo INTEGER DEFAULT 1,
    mostrar_controle INTEGER DEFAULT 1,
    mostrar_produto_final INTEGER DEFAULT 0,
    mostrar_observacao INTEGER DEFAULT 1,
    mostrar_codigo_barras INTEGER DEFAULT 1,
    -- Estilo
    fonte_tamanho TEXT DEFAULT 'medio',
    empresa_nome TEXT DEFAULT '',
    empresa_logo_url TEXT DEFAULT '',
    cor_borda_fita TEXT DEFAULT '#22c55e',
    cor_controle TEXT DEFAULT '',
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Templates de etiquetas (editor visual drag-and-drop)
  CREATE TABLE IF NOT EXISTS cnc_etiqueta_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL DEFAULT 'Sem nome',
    largura REAL NOT NULL DEFAULT 100,
    altura REAL NOT NULL DEFAULT 70,
    colunas_impressao INTEGER DEFAULT 2,
    margem_pagina REAL DEFAULT 8,
    gap_etiquetas REAL DEFAULT 4,
    elementos TEXT NOT NULL DEFAULT '[]',
    padrao INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Versionamento de planos de corte (snapshots transacionais)
  CREATE TABLE IF NOT EXISTS cnc_plano_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    plano_json TEXT NOT NULL,
    acao_origem TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_plano_versions_lote ON cnc_plano_versions(lote_id);

  -- ═══ Ponto / RH ═══
  CREATE TABLE IF NOT EXISTS funcionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT,
    cargo TEXT,
    data_admissao TEXT,
    salario_base REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ponto_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jornada_json TEXT DEFAULT '{}',
    tolerancia_min INTEGER DEFAULT 5,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ponto_registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    entrada TEXT,
    saida_almoco TEXT,
    volta_almoco TEXT,
    saida TEXT,
    tipo TEXT DEFAULT 'normal',
    obs TEXT,
    horas_trabalhadas REAL DEFAULT 0,
    horas_previstas REAL DEFAULT 0,
    saldo_minutos INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
    UNIQUE(funcionario_id, data)
  );

  CREATE TABLE IF NOT EXISTS ponto_feriados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ponto_registros_func ON ponto_registros(funcionario_id, data);
  CREATE INDEX IF NOT EXISTS idx_ponto_feriados_data ON ponto_feriados(data);
`);

// ═══ Ponto: default config + feriados nacionais ═══
db.exec(`INSERT OR IGNORE INTO ponto_config (id, jornada_json, tolerancia_min) VALUES (1, '{"seg":{"entrada":"07:30","saida_almoco":"12:00","volta_almoco":"13:00","saida":"17:30"},"ter":{"entrada":"07:30","saida_almoco":"12:00","volta_almoco":"13:00","saida":"17:30"},"qua":{"entrada":"07:30","saida_almoco":"12:00","volta_almoco":"13:00","saida":"17:30"},"qui":{"entrada":"07:30","saida_almoco":"12:00","volta_almoco":"13:00","saida":"17:30"},"sex":{"entrada":"07:30","saida_almoco":"12:00","volta_almoco":"13:00","saida":"16:30"},"sab":null,"dom":null}', 5)`);

// Feriados nacionais fixos (inserir para o ano corrente e próximo)
const feriadosNacionais = [
  { data: '01-01', descricao: 'Confraternização Universal' },
  { data: '04-21', descricao: 'Tiradentes' },
  { data: '05-01', descricao: 'Dia do Trabalho' },
  { data: '09-07', descricao: 'Independência do Brasil' },
  { data: '10-12', descricao: 'Nossa Senhora Aparecida' },
  { data: '11-02', descricao: 'Finados' },
  { data: '11-15', descricao: 'Proclamação da República' },
  { data: '12-25', descricao: 'Natal' },
];
const anoAtual = new Date().getFullYear();
const insertFeriado = db.prepare('INSERT OR IGNORE INTO ponto_feriados (data, descricao) VALUES (?, ?)');
for (const f of feriadosNacionais) {
  insertFeriado.run(`${anoAtual}-${f.data}`, f.descricao);
  insertFeriado.run(`${anoAtual + 1}-${f.data}`, f.descricao);
}

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
  // portal_tokens v3 — expiração de token
  "ALTER TABLE portal_tokens ADD COLUMN expira_em TEXT",
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
  "ALTER TABLE empresa_config ADD COLUMN wa_owner_phone TEXT DEFAULT ''",
  // ═══ IA config ═══
  "ALTER TABLE empresa_config ADD COLUMN ia_provider TEXT DEFAULT 'anthropic'",
  "ALTER TABLE empresa_config ADD COLUMN ia_api_key TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN ia_model TEXT DEFAULT 'claude-sonnet-4'",
  "ALTER TABLE empresa_config ADD COLUMN ia_system_prompt TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN ia_temperatura REAL DEFAULT 0.7",
  "ALTER TABLE empresa_config ADD COLUMN ia_ativa INTEGER DEFAULT 0",
  "ALTER TABLE empresa_config ADD COLUMN ia_blocked_phones TEXT DEFAULT ''",
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
  // ═══ Geolocalização GPS: coordenadas precisas ═══
  "ALTER TABLE proposta_acessos ADD COLUMN lat REAL DEFAULT NULL",
  "ALTER TABLE proposta_acessos ADD COLUMN lon REAL DEFAULT NULL",
  // ═══ CNC: vincular ferramentas a máquinas ═══
  "ALTER TABLE cnc_ferramentas ADD COLUMN maquina_id INTEGER REFERENCES cnc_maquinas(id) ON DELETE CASCADE",
  // ═══ CNC: kerf, guilhotina, retalhos, iterações ═══
  "ALTER TABLE cnc_chapas ADD COLUMN kerf REAL DEFAULT 4",
  "ALTER TABLE cnc_config ADD COLUMN kerf_padrao REAL DEFAULT 4",
  "ALTER TABLE cnc_config ADD COLUMN usar_guilhotina INTEGER DEFAULT 1",
  "ALTER TABLE cnc_config ADD COLUMN usar_retalhos INTEGER DEFAULT 1",
  "ALTER TABLE cnc_config ADD COLUMN iteracoes_otimizador INTEGER DEFAULT 300",
  // ═══ CNC: persistir todas as configs do otimizador ═══
  "ALTER TABLE cnc_materiais ADD COLUMN permitir_rotacao INTEGER DEFAULT -1",
  "ALTER TABLE cnc_config ADD COLUMN modo_otimizador TEXT DEFAULT 'guilhotina'",
  "ALTER TABLE cnc_config ADD COLUMN refilo REAL DEFAULT 10",
  "ALTER TABLE cnc_config ADD COLUMN permitir_rotacao INTEGER DEFAULT 1",
  "ALTER TABLE cnc_config ADD COLUMN direcao_corte TEXT DEFAULT 'misto'",
  // ═══ CNC: anti-arrasto (peças pequenas) ═══
  "ALTER TABLE cnc_maquinas ADD COLUMN usar_onion_skin INTEGER DEFAULT 1",
  "ALTER TABLE cnc_maquinas ADD COLUMN onion_skin_espessura REAL DEFAULT 0.5",
  "ALTER TABLE cnc_maquinas ADD COLUMN onion_skin_area_max REAL DEFAULT 500",
  "ALTER TABLE cnc_maquinas ADD COLUMN usar_tabs INTEGER DEFAULT 0",
  "ALTER TABLE cnc_maquinas ADD COLUMN tab_largura REAL DEFAULT 4",
  "ALTER TABLE cnc_maquinas ADD COLUMN tab_altura REAL DEFAULT 1.5",
  "ALTER TABLE cnc_maquinas ADD COLUMN tab_qtd INTEGER DEFAULT 2",
  "ALTER TABLE cnc_maquinas ADD COLUMN tab_area_max REAL DEFAULT 800",
  "ALTER TABLE cnc_maquinas ADD COLUMN usar_lead_in INTEGER DEFAULT 1",
  "ALTER TABLE cnc_maquinas ADD COLUMN lead_in_tipo TEXT DEFAULT 'arco'",
  "ALTER TABLE cnc_maquinas ADD COLUMN lead_in_raio REAL DEFAULT 5",
  "ALTER TABLE cnc_maquinas ADD COLUMN feed_rate_pct_pequenas REAL DEFAULT 50",
  "ALTER TABLE cnc_maquinas ADD COLUMN feed_rate_area_max REAL DEFAULT 500",
  // ═══ CNC: otimização multi-lote (multi-projeto) ═══
  "ALTER TABLE cnc_lotes ADD COLUMN grupo_otimizacao INTEGER DEFAULT NULL",
  // ═══ CNC: DOC + prof_extra por ferramenta ═══
  "ALTER TABLE cnc_ferramentas ADD COLUMN doc REAL DEFAULT NULL",
  "ALTER TABLE cnc_ferramentas ADD COLUMN profundidade_extra REAL DEFAULT NULL",
  "ALTER TABLE cnc_ferramentas ADD COLUMN tipo_corte TEXT DEFAULT 'broca'",
  "ALTER TABLE cnc_ferramentas ADD COLUMN comprimento_util REAL DEFAULT 25",
  "ALTER TABLE cnc_ferramentas ADD COLUMN num_cortes INTEGER DEFAULT 2",
  // ═══ CNC: G-Code v2 — Z-origin, N-codes, direção corte, dwell ═══
  "ALTER TABLE cnc_maquinas ADD COLUMN z_origin TEXT DEFAULT 'mesa'",
  "ALTER TABLE cnc_maquinas ADD COLUMN z_aproximacao REAL DEFAULT 2.0",
  "ALTER TABLE cnc_maquinas ADD COLUMN direcao_corte TEXT DEFAULT 'climb'",
  "ALTER TABLE cnc_maquinas ADD COLUMN usar_n_codes INTEGER DEFAULT 1",
  "ALTER TABLE cnc_maquinas ADD COLUMN n_code_incremento INTEGER DEFAULT 10",
  "ALTER TABLE cnc_maquinas ADD COLUMN dwell_spindle REAL DEFAULT 1.0",
  // ═══ CNC: G-Code v3 — Ramping, Lead-in, Vel. mergulho, Ordenação ═══
  "ALTER TABLE cnc_maquinas ADD COLUMN usar_rampa INTEGER DEFAULT 1",
  "ALTER TABLE cnc_maquinas ADD COLUMN rampa_angulo REAL DEFAULT 3.0",
  "ALTER TABLE cnc_maquinas ADD COLUMN vel_mergulho REAL DEFAULT 1500",
  "ALTER TABLE cnc_maquinas ADD COLUMN z_aproximacao_rapida REAL DEFAULT 5.0",
  "ALTER TABLE cnc_maquinas ADD COLUMN ordenar_contornos TEXT DEFAULT 'menor_primeiro'",
  // ═══ Versionamento de Orçamentos ═══
  "ALTER TABLE orcamentos ADD COLUMN versao INTEGER DEFAULT 1",
  "ALTER TABLE orcamentos ADD COLUMN versao_ativa INTEGER DEFAULT 1",
  // ═══ Analytics Avançado — Section Tracking + Interações ═══
  "ALTER TABLE proposta_acessos ADD COLUMN eventos_json TEXT DEFAULT ''",
  // ═══ Soft Delete — Histórico Financeiro ═══
  "ALTER TABLE contas_pagar ADD COLUMN deletado INTEGER DEFAULT 0",
  "ALTER TABLE contas_pagar ADD COLUMN deletado_em DATETIME DEFAULT NULL",
  "ALTER TABLE contas_pagar ADD COLUMN deletado_por INTEGER DEFAULT NULL",
  "ALTER TABLE contas_receber ADD COLUMN deletado INTEGER DEFAULT 0",
  "ALTER TABLE contas_receber ADD COLUMN deletado_em DATETIME DEFAULT NULL",
  "ALTER TABLE contas_receber ADD COLUMN deletado_por INTEGER DEFAULT NULL",
  "ALTER TABLE despesas_projeto ADD COLUMN deletado INTEGER DEFAULT 0",
  "ALTER TABLE despesas_projeto ADD COLUMN deletado_em DATETIME DEFAULT NULL",
  "ALTER TABLE despesas_projeto ADD COLUMN deletado_por INTEGER DEFAULT NULL",
  // ═══ Entrega Fotos: ambiente texto (alinhado com montador_fotos) ═══
  "ALTER TABLE entrega_fotos ADD COLUMN ambiente TEXT DEFAULT ''",
  // ═══ Portfolio — fotos-vitrine da empresa para landing page ═══
  `CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL DEFAULT '',
    designer TEXT DEFAULT '',
    descricao TEXT DEFAULT '',
    imagem TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Depoimentos — testimonials configuráveis para apresentação ═══
  `CREATE TABLE IF NOT EXISTS depoimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_cliente TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    estrelas INTEGER DEFAULT 5,
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Template padrão de etapas (com durações) ═══
  "ALTER TABLE empresa_config ADD COLUMN etapas_template_json TEXT DEFAULT '[]'",
  // ═══ Cor primária do sistema (white-label) ═══
  "ALTER TABLE empresa_config ADD COLUMN sistema_cor_primaria TEXT DEFAULT '#1379F0'",
  // ═══ Landing Page pública (conteúdo dinâmico) ═══
  "ALTER TABLE empresa_config ADD COLUMN landing_ativo INTEGER DEFAULT 1",
  "ALTER TABLE empresa_config ADD COLUMN landing_titulo TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_subtitulo TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_descricao TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_cta_primaria TEXT DEFAULT 'Solicitar orçamento'",
  "ALTER TABLE empresa_config ADD COLUMN landing_cta_secundaria TEXT DEFAULT 'Falar no WhatsApp'",
  "ALTER TABLE empresa_config ADD COLUMN landing_form_titulo TEXT DEFAULT 'Solicite um atendimento'",
  "ALTER TABLE empresa_config ADD COLUMN landing_form_descricao TEXT DEFAULT 'Preencha os dados para receber contato da equipe Ornato.'",
  "ALTER TABLE empresa_config ADD COLUMN landing_cta_titulo TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_cta_descricao TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_texto_rodape TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_prova_titulo TEXT DEFAULT 'Clientes que confiaram na Ornato'",
  "ALTER TABLE empresa_config ADD COLUMN landing_provas_json TEXT DEFAULT '[]'",
  "ALTER TABLE empresa_config ADD COLUMN landing_logo TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_hero_imagem TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_hero_video_url TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_hero_video_poster TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_grafismo_imagem TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN landing_cor_fundo TEXT DEFAULT '#1E1917'",
  "ALTER TABLE empresa_config ADD COLUMN landing_cor_destaque TEXT DEFAULT '#93614C'",
  "ALTER TABLE empresa_config ADD COLUMN landing_cor_neutra TEXT DEFAULT '#847974'",
  "ALTER TABLE empresa_config ADD COLUMN landing_cor_clara TEXT DEFAULT '#DDD2CC'",
  "ALTER TABLE empresa_config ADD COLUMN landing_servicos_json TEXT DEFAULT '[]'",
  "ALTER TABLE empresa_config ADD COLUMN landing_diferenciais_json TEXT DEFAULT '[]'",
  "ALTER TABLE empresa_config ADD COLUMN landing_etapas_json TEXT DEFAULT '[]'",
  // ═══ Projetista Visual (DESCONTINUADO — tabela mantida para dados legados) ═══
  `CREATE TABLE IF NOT EXISTS projetos_visual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL DEFAULT 'Novo Projeto',
    cliente_nome TEXT DEFAULT '',
    json_data TEXT NOT NULL DEFAULT '{}',
    orc_id INTEGER REFERENCES orcamentos(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══════════════════════════════════════════════════════
  // ETAPA 1 — Reestruturação: Projeto Hub + Industrialização
  // ═══════════════════════════════════════════════════════

  // Vincular cnc_lotes a projetos/orçamentos
  "ALTER TABLE cnc_lotes ADD COLUMN projeto_id INTEGER REFERENCES projetos(id)",
  "ALTER TABLE cnc_lotes ADD COLUMN orc_id INTEGER REFERENCES orcamentos(id)",
  "ALTER TABLE cnc_lotes ADD COLUMN origem TEXT DEFAULT 'json_import'",

  // Versionamento de projetos
  `CREATE TABLE IF NOT EXISTS projeto_versoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'orcamento',
    orc_id INTEGER REFERENCES orcamentos(id),
    json_data TEXT DEFAULT '',
    descricao TEXT DEFAULT '',
    versao INTEGER DEFAULT 1,
    ativa INTEGER DEFAULT 1,
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══════════════════════════════════════════════════════
  // ETAPA 2 — Industrialização: Ordens de Produção
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS ordens_producao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    versao_id INTEGER REFERENCES projeto_versoes(id),
    lote_id INTEGER REFERENCES cnc_lotes(id),
    numero TEXT NOT NULL,
    status TEXT DEFAULT 'rascunho',
    readiness_json TEXT DEFAULT '{}',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ── Centro de Custo ──
  `ALTER TABLE empresa_config ADD COLUMN centro_custo_json TEXT DEFAULT '[]'`,
  `ALTER TABLE empresa_config ADD COLUMN centro_custo_dias_uteis INTEGER DEFAULT 22`,
  // ── Ambientes no Projeto ──
  `ALTER TABLE projetos ADD COLUMN ambientes_json TEXT DEFAULT '[]'`,
  `ALTER TABLE projetos ADD COLUMN mostrar_ambientes_portal INTEGER DEFAULT 0`,
  // ── Pagamento per-project no portal ──
  `ALTER TABLE projetos ADD COLUMN portal_mostrar_pagamento INTEGER DEFAULT 0`,
  // ── Nome do cliente direto no projeto (fallback se não tiver orçamento) ──
  "ALTER TABLE projetos ADD COLUMN cliente_nome TEXT DEFAULT ''",
  // ── Documentos visíveis no portal ──
  `ALTER TABLE projeto_arquivos ADD COLUMN visivel_portal INTEGER DEFAULT 0`,
  // ── Histórico de acessos do portal ──
  `CREATE TABLE IF NOT EXISTS portal_acessos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    token TEXT NOT NULL,
    acessado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    dispositivo TEXT DEFAULT '',
    navegador TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    regiao TEXT DEFAULT ''
  )`,
  // ── Geolocalização nos acessos do portal ──
  `ALTER TABLE portal_acessos ADD COLUMN latitude REAL`,
  `ALTER TABLE portal_acessos ADD COLUMN longitude REAL`,

  // ═══════════════════════════════════════════════════════
  // PRECISÃO DE ORÇAMENTO — Fases 1-5
  // ═══════════════════════════════════════════════════════

  // ── Fase 1: Custo-hora fábrica + tempos por operação ──
  `ALTER TABLE config_taxas ADD COLUMN custo_hora_ativo INTEGER DEFAULT 0`,
  `ALTER TABLE config_taxas ADD COLUMN func_producao INTEGER DEFAULT 10`,
  `ALTER TABLE config_taxas ADD COLUMN horas_dia REAL DEFAULT 8.5`,
  `ALTER TABLE config_taxas ADD COLUMN dias_uteis INTEGER DEFAULT 22`,
  `ALTER TABLE config_taxas ADD COLUMN eficiencia REAL DEFAULT 75`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_corte REAL DEFAULT 0.02`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_fita REAL DEFAULT 0.01`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_furacao REAL DEFAULT 0.03`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_montagem REAL DEFAULT 0.50`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_acabamento REAL DEFAULT 0.15`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_embalagem REAL DEFAULT 0.20`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_instalacao REAL DEFAULT 0.80`,
  // ── Calibração v2: tempos por componente na montagem ──
  `ALTER TABLE config_taxas ADD COLUMN tempo_montagem_porta REAL DEFAULT 0.08`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_montagem_gaveta REAL DEFAULT 0.12`,
  `ALTER TABLE config_taxas ADD COLUMN tempo_montagem_prat REAL DEFAULT 0.03`,
  // ── Calibração v3: modelo baseado em dimensões reais (CNC vel + fita overhead) ──
  `ALTER TABLE config_taxas ADD COLUMN cnc_velocidade REAL DEFAULT 5000`,
  `ALTER TABLE config_taxas ADD COLUMN cnc_overhead_peca REAL DEFAULT 20`,
  `ALTER TABLE config_taxas ADD COLUMN cnc_overhead_chapa REAL DEFAULT 300`,
  `ALTER TABLE config_taxas ADD COLUMN fita_velocidade REAL DEFAULT 500`,
  `ALTER TABLE config_taxas ADD COLUMN fita_overhead_borda REAL DEFAULT 90`,
  // Atualizar montagem defaults (ref: WoodWeb, ShopSabre)
  `UPDATE config_taxas SET tempo_montagem=0.25, tempo_montagem_porta=0.15, tempo_montagem_gaveta=0.25, tempo_montagem_prat=0.05, tempo_acabamento=0.17, tempo_embalagem=0.25, tempo_instalacao=0.75 WHERE tempo_montagem_porta=0.08`,

  // ── Fase 2: Consumíveis automáticos ──
  `ALTER TABLE config_taxas ADD COLUMN consumiveis_ativo INTEGER DEFAULT 0`,
  `ALTER TABLE config_taxas ADD COLUMN cons_cola_m2 REAL DEFAULT 2.50`,
  `ALTER TABLE config_taxas ADD COLUMN cons_minifix_un REAL DEFAULT 1.80`,
  `ALTER TABLE config_taxas ADD COLUMN cons_parafuso_un REAL DEFAULT 0.35`,
  `ALTER TABLE config_taxas ADD COLUMN cons_lixa_m2 REAL DEFAULT 1.20`,
  `ALTER TABLE config_taxas ADD COLUMN cons_embalagem_mod REAL DEFAULT 15.00`,

  // ── Fase 4: Feedback loop — custo real vs orçado ──
  `CREATE TABLE IF NOT EXISTS custo_real_projeto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    orc_id INTEGER REFERENCES orcamentos(id),
    custo_material_orcado REAL DEFAULT 0,
    custo_mdo_orcado REAL DEFAULT 0,
    pv_orcado REAL DEFAULT 0,
    custo_material_real REAL DEFAULT 0,
    custo_mdo_real REAL DEFAULT 0,
    horas_reais REAL DEFAULT 0,
    desvio_pct REAL DEFAULT 0,
    obs TEXT DEFAULT '',
    finalizado INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ── Fase 5: Validade de preço de materiais ──
  `ALTER TABLE biblioteca ADD COLUMN preco_atualizado_em DATE DEFAULT NULL`,
  `ALTER TABLE biblioteca ADD COLUMN preco_validade_dias INTEGER DEFAULT 90`,

  // ── Fix: Flag de acesso interno (não poluir lead score) ──
  `ALTER TABLE proposta_acessos ADD COLUMN is_internal INTEGER DEFAULT 0`,

  // ═══════════════════════════════════════════════════════
  // ASSINATURA ELETRÔNICA — Lei 14.063/2020
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS documento_assinaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orc_id INTEGER NOT NULL REFERENCES orcamentos(id),
    tipo_documento TEXT NOT NULL DEFAULT 'contrato',
    token TEXT UNIQUE NOT NULL,
    codigo_verificacao TEXT UNIQUE NOT NULL,
    html_documento TEXT NOT NULL DEFAULT '',
    hash_documento TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    concluido_em DATETIME,
    expira_em DATETIME,
    cancelado_em DATETIME,
    cancelado_por INTEGER REFERENCES users(id),
    motivo_cancelamento TEXT DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS assinatura_signatarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento_id INTEGER NOT NULL REFERENCES documento_assinaturas(id) ON DELETE CASCADE,
    papel TEXT NOT NULL DEFAULT 'contratante',
    nome TEXT NOT NULL DEFAULT '',
    cpf TEXT NOT NULL DEFAULT '',
    email TEXT DEFAULT '',
    telefone TEXT DEFAULT '',
    token TEXT UNIQUE NOT NULL,
    ordem INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente',
    assinado_em DATETIME,
    ip_assinatura TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    dispositivo TEXT DEFAULT '',
    navegador TEXT DEFAULT '',
    os_name TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    pais TEXT DEFAULT '',
    lat REAL,
    lon REAL,
    assinatura_img TEXT DEFAULT '',
    hash_assinatura TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══════════════════════════════════════════════════════
  // MÓDULO DE COMPRAS — Fornecedores, NF XML, Ordens de Compra
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cnpj TEXT DEFAULT '',
    telefone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    endereco TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    contato TEXT DEFAULT '',
    obs TEXT DEFAULT '',
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS nf_entrada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fornecedor_id INTEGER REFERENCES fornecedores(id),
    numero_nf TEXT NOT NULL DEFAULT '',
    serie TEXT DEFAULT '',
    chave_acesso TEXT DEFAULT '',
    data_emissao DATE,
    data_entrada DATE DEFAULT CURRENT_DATE,
    valor_total REAL DEFAULT 0,
    valor_frete REAL DEFAULT 0,
    valor_desconto REAL DEFAULT 0,
    cfop TEXT DEFAULT '',
    xml_raw TEXT DEFAULT '',
    projeto_id INTEGER REFERENCES projetos(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    status TEXT DEFAULT 'pendente',
    processado INTEGER DEFAULT 0,
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS nf_entrada_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nf_id INTEGER NOT NULL REFERENCES nf_entrada(id) ON DELETE CASCADE,
    codigo_produto TEXT DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    ncm TEXT DEFAULT '',
    cfop TEXT DEFAULT '',
    unidade TEXT DEFAULT 'UN',
    quantidade REAL DEFAULT 0,
    valor_unitario REAL DEFAULT 0,
    valor_total REAL DEFAULT 0,
    biblioteca_id INTEGER REFERENCES biblioteca(id),
    vinculado INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ordens_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fornecedor_id INTEGER REFERENCES fornecedores(id),
    projeto_id INTEGER REFERENCES projetos(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    numero TEXT DEFAULT '',
    status TEXT DEFAULT 'rascunho',
    valor_total REAL DEFAULT 0,
    data_necessidade DATE,
    obs TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ordens_compra_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordem_id INTEGER NOT NULL REFERENCES ordens_compra(id) ON DELETE CASCADE,
    biblioteca_id INTEGER REFERENCES biblioteca(id),
    descricao TEXT NOT NULL DEFAULT '',
    quantidade REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    valor_unitario REAL DEFAULT 0,
    valor_total REAL DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // PRODUÇÃO AVANÇADA — Apontamento QR, Capacidade, Qualidade
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS producao_apontamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    orc_id INTEGER REFERENCES orcamentos(id),
    modulo_id TEXT DEFAULT '',
    modulo_nome TEXT DEFAULT '',
    etapa TEXT NOT NULL DEFAULT 'corte',
    colaborador_id INTEGER REFERENCES colaboradores(id),
    inicio DATETIME,
    fim DATETIME,
    duracao_min REAL DEFAULT 0,
    obs TEXT DEFAULT '',
    qr_token TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS producao_qualidade (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    modulo_id TEXT DEFAULT '',
    modulo_nome TEXT DEFAULT '',
    checklist_json TEXT DEFAULT '[]',
    aprovado INTEGER DEFAULT 0,
    obs TEXT DEFAULT '',
    fotos_json TEXT DEFAULT '[]',
    conferido_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // LOGÍSTICA — Entregas, Agendamento, Instalação
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS entregas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    data_agendada DATE,
    turno TEXT DEFAULT 'manha',
    endereco TEXT DEFAULT '',
    motorista TEXT DEFAULT '',
    veiculo TEXT DEFAULT '',
    status TEXT DEFAULT 'agendada',
    checkin_hora DATETIME,
    checkout_hora DATETIME,
    checkin_lat REAL, checkin_lon REAL,
    obs TEXT DEFAULT '',
    criado_por INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS instalacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id),
    entrega_id INTEGER REFERENCES entregas(id),
    montador_id INTEGER REFERENCES colaboradores(id),
    data_agendada DATE,
    data_inicio DATETIME,
    data_fim DATETIME,
    status TEXT DEFAULT 'agendada',
    horas_reais REAL DEFAULT 0,
    ocorrencias_json TEXT DEFAULT '[]',
    fotos_json TEXT DEFAULT '[]',
    avaliacao_cliente INTEGER DEFAULT 0,
    obs TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // COMPLIANCE — Audit Trail, LGPD
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_nome TEXT DEFAULT '',
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    dados_antes TEXT DEFAULT '',
    dados_depois TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // MARKETING — NPS, Indicações
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS pesquisa_nps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER REFERENCES projetos(id),
    cliente_id INTEGER REFERENCES clientes(id),
    nota INTEGER DEFAULT 0,
    comentario TEXT DEFAULT '',
    token TEXT UNIQUE,
    respondido INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    respondido_em DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS indicacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_origem_id INTEGER REFERENCES clientes(id),
    nome_indicado TEXT DEFAULT '',
    telefone_indicado TEXT DEFAULT '',
    email_indicado TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    convertido_cliente_id INTEGER REFERENCES clientes(id),
    recompensa TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // GESTÃO DE PESSOAS — Ponto, Férias
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS controle_ponto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    data DATE NOT NULL,
    entrada DATETIME,
    saida_almoco DATETIME,
    retorno_almoco DATETIME,
    saida DATETIME,
    horas_trabalhadas REAL DEFAULT 0,
    horas_extras REAL DEFAULT 0,
    lat REAL, lon REAL,
    obs TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ferias_afastamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    tipo TEXT DEFAULT 'ferias',
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    dias INTEGER DEFAULT 0,
    status TEXT DEFAULT 'aprovado',
    obs TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══════════════════════════════════════════════════════
  // MANUTENÇÃO PREVENTIVA — Máquinas
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS manutencao_maquinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_nome TEXT NOT NULL DEFAULT '',
    tipo TEXT DEFAULT 'preventiva',
    descricao TEXT DEFAULT '',
    data_realizada DATE,
    data_proxima DATE,
    custo REAL DEFAULT 0,
    responsavel TEXT DEFAULT '',
    horas_uso REAL DEFAULT 0,
    obs TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Campos redes sociais + proposta incluso + anos experiência ═══
  "ALTER TABLE empresa_config ADD COLUMN instagram TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN facebook TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN proposta_incluso TEXT DEFAULT 'Projeto 3D personalizado;Produção própria com maquinário industrial;Entrega e instalação no local;Acabamento premium e ferragens de primeira linha;Garantia de fábrica'",
  "ALTER TABLE empresa_config ADD COLUMN anos_experiencia INTEGER DEFAULT 0",
  // ═══ Apresentação: stats + texto institucional ═══
  "ALTER TABLE empresa_config ADD COLUMN projetos_entregues INTEGER DEFAULT 0",
  "ALTER TABLE empresa_config ADD COLUMN maquinas_industriais INTEGER DEFAULT 0",
  "ALTER TABLE empresa_config ADD COLUMN texto_institucional TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN desc_maquinas TEXT DEFAULT ''",
  // ═══ Portal: toggle pagamento ═══
  "ALTER TABLE empresa_config ADD COLUMN portal_mostrar_pagamento INTEGER DEFAULT 0",
  // ═══ Aprovação digital — colunas em orcamentos ═══
  "ALTER TABLE orcamentos ADD COLUMN aprovado_em DATETIME",
  "ALTER TABLE orcamentos ADD COLUMN aprovado_por TEXT DEFAULT ''",
  // ═══ Responsável legal + assinatura da empresa ═══
  "ALTER TABLE empresa_config ADD COLUMN responsavel_legal_nome TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN responsavel_legal_cpf TEXT DEFAULT ''",
  "ALTER TABLE empresa_config ADD COLUMN assinatura_empresa_img TEXT DEFAULT ''",

  // ═══════════════════════════════════════════════════════
  // EXPEDIÇÃO CNC — Checkpoints e Scans
  // ═══════════════════════════════════════════════════════
  `CREATE TABLE IF NOT EXISTS cnc_expedicao_checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    cor TEXT DEFAULT '#3b82f6',
    icone TEXT DEFAULT 'package',
    ativo INTEGER DEFAULT 1,
    obrigatorio INTEGER DEFAULT 1,
    user_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS cnc_expedicao_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    peca_id INTEGER NOT NULL,
    lote_id INTEGER NOT NULL,
    checkpoint_id INTEGER NOT NULL,
    operador TEXT,
    estacao TEXT,
    observacao TEXT,
    metodo TEXT DEFAULT 'scan',
    escaneado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (peca_id) REFERENCES cnc_pecas(id),
    FOREIGN KEY (lote_id) REFERENCES cnc_lotes(id),
    FOREIGN KEY (checkpoint_id) REFERENCES cnc_expedicao_checkpoints(id)
  )`,
  // ═══ Expedicao: campo metodo (scan/manual) ═══
  "ALTER TABLE cnc_expedicao_scans ADD COLUMN metodo TEXT DEFAULT 'scan'",
  // ═══ Expedicao: Volumes / Pacotes ═══
  `CREATE TABLE IF NOT EXISTS cnc_expedicao_volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    peca_ids TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ CNC Peças: cor da fita de borda por face ═══
  "ALTER TABLE cnc_pecas ADD COLUMN borda_cor_frontal TEXT",
  "ALTER TABLE cnc_pecas ADD COLUMN borda_cor_traseira TEXT",
  "ALTER TABLE cnc_pecas ADD COLUMN borda_cor_dir TEXT",
  "ALTER TABLE cnc_pecas ADD COLUMN borda_cor_esq TEXT",
  // ═══ CNC Materiais: cadastro completo ═══
  `CREATE TABLE IF NOT EXISTS cnc_materiais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    codigo TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL,
    espessura REAL DEFAULT 18,
    comprimento_chapa REAL DEFAULT 2750,
    largura_chapa REAL DEFAULT 1830,
    veio TEXT DEFAULT 'sem_veio',
    melamina TEXT DEFAULT 'ambos',
    cor TEXT DEFAULT '',
    acabamento TEXT DEFAULT '',
    fornecedor TEXT DEFAULT '',
    custo_m2 REAL DEFAULT 0,
    refilo REAL DEFAULT 10,
    kerf REAL DEFAULT 4,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ CNC Peças: referência ao material cadastrado ═══
  "ALTER TABLE cnc_pecas ADD COLUMN material_id INTEGER REFERENCES cnc_materiais(id)",
  "ALTER TABLE cnc_pecas ADD COLUMN face_cnc TEXT DEFAULT 'auto'",
  // ═══ CNC Override de usinagens por lote ═══
  `CREATE TABLE IF NOT EXISTS cnc_lote_usinagem_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    peca_persistent_id TEXT NOT NULL,
    worker_index INTEGER NOT NULL,
    ativo INTEGER DEFAULT 0,
    motivo TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, peca_persistent_id, worker_index)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_cnc_materiais_ativo ON cnc_materiais(ativo)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_overrides_lote ON cnc_lote_usinagem_overrides(lote_id)",

  // ═══ G-Code v4: Estratégias de usinagem, rampa helicoidal, pocket inteligente, compensação raio ═══
  // Máquina: novos campos de estratégia
  "ALTER TABLE cnc_maquinas ADD COLUMN rampa_tipo TEXT DEFAULT 'linear'",          // linear, helicoidal, plunge
  "ALTER TABLE cnc_maquinas ADD COLUMN vel_rampa REAL DEFAULT 1500",               // velocidade específica da rampa (mm/min)
  "ALTER TABLE cnc_maquinas ADD COLUMN rampa_diametro_pct REAL DEFAULT 80",        // % do diâmetro para raio da hélice
  "ALTER TABLE cnc_maquinas ADD COLUMN stepover_pct REAL DEFAULT 60",              // % do diâmetro da fresa para stepover
  "ALTER TABLE cnc_maquinas ADD COLUMN pocket_acabamento INTEGER DEFAULT 1",       // passe de acabamento no contorno do pocket
  "ALTER TABLE cnc_maquinas ADD COLUMN pocket_acabamento_offset REAL DEFAULT 0.2", // material a deixar para acabamento (mm)
  "ALTER TABLE cnc_maquinas ADD COLUMN pocket_direcao TEXT DEFAULT 'auto'",        // auto (eixo longo), x, y
  "ALTER TABLE cnc_maquinas ADD COLUMN compensar_raio_canal INTEGER DEFAULT 1",    // compensar raio da fresa nos cantos de canais
  "ALTER TABLE cnc_maquinas ADD COLUMN compensacao_tipo TEXT DEFAULT 'overcut'",   // overcut (avanço do raio), dogbone
  "ALTER TABLE cnc_maquinas ADD COLUMN circular_passes_acabamento INTEGER DEFAULT 1", // passes de acabamento em furos circulares
  "ALTER TABLE cnc_maquinas ADD COLUMN circular_offset_desbaste REAL DEFAULT 0.3",   // offset de desbaste antes do acabamento (mm)
  "ALTER TABLE cnc_maquinas ADD COLUMN vel_acabamento_pct REAL DEFAULT 80",          // % da vel_corte para passes de acabamento
  // Tipos de usinagem: estratégias alternativas
  "ALTER TABLE cnc_usinagem_tipos ADD COLUMN estrategias TEXT DEFAULT '[]'",        // JSON: [{metodo, tool_match, diam_min, diam_max, params}]
  // Segurança CNC: proteção da mesa de sacrifício
  "ALTER TABLE cnc_maquinas ADD COLUMN margem_mesa_sacrificio REAL DEFAULT 0.5",   // mm máx. além da espessura do material
  // G0 com velocidade: algumas máquinas precisam de F no G0
  "ALTER TABLE cnc_maquinas ADD COLUMN g0_com_feed INTEGER DEFAULT 0",             // 0=G0 puro, 1=G0 com F (vel_vazio)

  // ═══════════════════════════════════════════════════════
  // CNC v5: Templates de Usinagem, Desgaste de Ferramentas,
  //         Dashboard Produção, Lado A/B, Custeio, Multi-Máquina
  // ═══════════════════════════════════════════════════════

  // ═══ Machining Templates Library ═══
  `CREATE TABLE IF NOT EXISTS cnc_machining_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    categoria TEXT DEFAULT '',
    machining_json TEXT NOT NULL DEFAULT '{}',
    espelhavel INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    uso_count INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Tool Wear Tracking ═══
  `CREATE TABLE IF NOT EXISTS cnc_tool_wear_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL REFERENCES cnc_ferramentas(id) ON DELETE CASCADE,
    lote_id INTEGER REFERENCES cnc_lotes(id),
    metros_lineares REAL DEFAULT 0,
    tempo_corte_min REAL DEFAULT 0,
    num_operacoes INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  "ALTER TABLE cnc_ferramentas ADD COLUMN metros_acumulados REAL DEFAULT 0",
  "ALTER TABLE cnc_ferramentas ADD COLUMN metros_limite REAL DEFAULT 5000",
  "ALTER TABLE cnc_ferramentas ADD COLUMN ultimo_reset_em DATETIME",

  // ═══ Production Dashboard ═══
  `CREATE TABLE IF NOT EXISTS cnc_production_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo TEXT NOT NULL,
    tipo_periodo TEXT NOT NULL,
    chapas_cortadas INTEGER DEFAULT 0,
    pecas_produzidas INTEGER DEFAULT 0,
    metros_lineares REAL DEFAULT 0,
    aproveitamento_medio REAL DEFAULT 0,
    tempo_maquina_min REAL DEFAULT 0,
    custo_material REAL DEFAULT 0,
    custo_ferramentas REAL DEFAULT 0,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(periodo, tipo_periodo)
  )`,

  // ═══ Side A / Side B ═══
  "ALTER TABLE cnc_pecas ADD COLUMN lado_ativo TEXT DEFAULT 'A'",
  "ALTER TABLE cnc_pecas ADD COLUMN machining_json_b TEXT DEFAULT '{}'",

  // ═══ Per-Piece Costing ═══
  "ALTER TABLE cnc_config ADD COLUMN custo_hora_maquina REAL DEFAULT 80",
  "ALTER TABLE cnc_config ADD COLUMN custo_troca_ferramenta REAL DEFAULT 5",

  // ═══ Tool Change Optimization ═══
  "ALTER TABLE cnc_config ADD COLUMN otimizar_trocas_ferramenta INTEGER DEFAULT 1",

  // ═══ Multi-Machine ═══
  `CREATE TABLE IF NOT EXISTS cnc_machine_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    chapa_idx INTEGER NOT NULL,
    maquina_id INTEGER NOT NULL REFERENCES cnc_maquinas(id),
    prioridade INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, chapa_idx)
  )`,
  "ALTER TABLE cnc_lotes ADD COLUMN modo_multi_maquina INTEGER DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS cnc_expedicao_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL,
    volume_id INTEGER,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ CNC Material Map: SketchUp → Biblioteca ═══
  `CREATE TABLE IF NOT EXISTS cnc_material_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    material_code_original TEXT NOT NULL,
    espessura_original REAL NOT NULL,
    biblioteca_id INTEGER NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, material_code_original, espessura_original)
  )`,
  "ALTER TABLE cnc_pecas ADD COLUMN biblioteca_id INTEGER REFERENCES biblioteca(id)",

  // ═══ Remnant History / Traceability ═══
  `CREATE TABLE IF NOT EXISTS cnc_retalho_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retalho_id TEXT,
    lote_id INTEGER,
    chapa_idx INTEGER,
    largura REAL,
    comprimento REAL,
    material_code TEXT,
    espessura REAL,
    origem_lote_id INTEGER,
    origem_chapa_idx INTEGER,
    acao TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Remnant Photos ═══
  `CREATE TABLE IF NOT EXISTS cnc_retalho_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retalho_id TEXT,
    lote_id INTEGER,
    chapa_idx INTEGER,
    foto_path TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ G-Code Generation History ═══
  `CREATE TABLE IF NOT EXISTS cnc_gcode_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    chapa_idx INTEGER,
    maquina_id INTEGER,
    maquina_nome TEXT DEFAULT '',
    filename TEXT DEFAULT '',
    gcode_hash TEXT DEFAULT '',
    total_operacoes INTEGER DEFAULT 0,
    tempo_estimado_min REAL DEFAULT 0,
    dist_corte_m REAL DEFAULT 0,
    alertas_count INTEGER DEFAULT 0,
    user_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Machine Direct Send (FTP/SMB) ═══
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_tipo TEXT DEFAULT ''",
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_host TEXT DEFAULT ''",
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_porta INTEGER DEFAULT 21",
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_usuario TEXT DEFAULT ''",
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_senha TEXT DEFAULT ''",
  "ALTER TABLE cnc_maquinas ADD COLUMN envio_pasta TEXT DEFAULT '/'",

  // ═══ Overrides de operações CNC (painel de ferramentas) ═══
  `CREATE TABLE IF NOT EXISTS cnc_operacao_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    op_key TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    metodo TEXT DEFAULT '',
    ferramenta_id INTEGER DEFAULT NULL,
    diametro_override REAL DEFAULT NULL,
    profundidade_override REAL DEFAULT NULL,
    rpm_override INTEGER DEFAULT NULL,
    feed_override REAL DEFAULT NULL,
    stepover_override REAL DEFAULT NULL,
    passes_acabamento_override INTEGER DEFAULT NULL,
    notas TEXT DEFAULT '',
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, op_key)
  )`,
  // Override individual por peça dentro de um grupo
  `CREATE TABLE IF NOT EXISTS cnc_operacao_overrides_peca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    op_key TEXT NOT NULL,
    peca_id INTEGER NOT NULL,
    ativo INTEGER DEFAULT 1,
    profundidade_override REAL DEFAULT NULL,
    diametro_override REAL DEFAULT NULL,
    notas TEXT DEFAULT '',
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, op_key, peca_id)
  )`,

  // ═══ Chapa Production Status (multi-state) ═══
  `CREATE TABLE IF NOT EXISTS cnc_chapa_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    chapa_idx INTEGER NOT NULL,
    status TEXT DEFAULT 'pendente',
    operador TEXT DEFAULT '',
    inicio_em DATETIME,
    fim_em DATETIME,
    observacao TEXT DEFAULT '',
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, chapa_idx)
  )`,

  // ═══ Conferência pós-corte (checklist por chapa) ═══
  `CREATE TABLE IF NOT EXISTS cnc_conferencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    chapa_idx INTEGER NOT NULL,
    peca_idx INTEGER NOT NULL,
    peca_desc TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    defeito_tipo TEXT DEFAULT '',
    defeito_obs TEXT DEFAULT '',
    conferente TEXT DEFAULT '',
    conferido_em DATETIME,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, chapa_idx, peca_idx)
  )`,

  // ═══ Fila de produção CNC ═══
  `CREATE TABLE IF NOT EXISTS cnc_fila_producao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    chapa_idx INTEGER NOT NULL,
    prioridade INTEGER DEFAULT 0,
    status TEXT DEFAULT 'aguardando',
    maquina_id INTEGER REFERENCES cnc_maquinas(id),
    operador TEXT DEFAULT '',
    inicio_em DATETIME,
    fim_em DATETIME,
    ordem INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, chapa_idx)
  )`,

  // ═══ Estoque de chapas — movimentações ═══
  `CREATE TABLE IF NOT EXISTS cnc_estoque_mov (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapa_id INTEGER REFERENCES cnc_chapas(id),
    tipo TEXT NOT NULL,
    quantidade INTEGER DEFAULT 0,
    lote_id INTEGER,
    motivo TEXT DEFAULT '',
    user_id INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ Estoque de chapas — saldo ═══
  `ALTER TABLE cnc_chapas ADD COLUMN estoque_qtd INTEGER DEFAULT 0`,
  `ALTER TABLE cnc_chapas ADD COLUMN estoque_minimo INTEGER DEFAULT 0`,
  `ALTER TABLE cnc_chapas ADD COLUMN custo_unitario REAL DEFAULT 0`,

  // ═══ Custeio por peça (cache do último cálculo) ═══
  `CREATE TABLE IF NOT EXISTS cnc_custeio_peca (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER REFERENCES cnc_lotes(id) ON DELETE CASCADE,
    peca_id INTEGER,
    peca_desc TEXT DEFAULT '',
    custo_material REAL DEFAULT 0,
    custo_maquina REAL DEFAULT 0,
    custo_borda REAL DEFAULT 0,
    custo_total REAL DEFAULT 0,
    area_m2 REAL DEFAULT 0,
    tempo_min REAL DEFAULT 0,
    calculado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ #20 Manutenção programada de ferramentas ═══
  `CREATE TABLE IF NOT EXISTS cnc_tool_manutencao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER REFERENCES cnc_ferramentas(id) ON DELETE CASCADE,
    tipo TEXT DEFAULT 'afiacao',
    descricao TEXT DEFAULT '',
    agendado_para DATETIME,
    concluido_em DATETIME,
    status TEXT DEFAULT 'agendado',
    notas TEXT DEFAULT '',
    user_id INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // ═══ Direção de corte e modo por material (per-material optimization) ═══
  `ALTER TABLE cnc_chapas ADD COLUMN direcao_corte TEXT DEFAULT 'herdar'`,
  `ALTER TABLE cnc_chapas ADD COLUMN modo_corte TEXT DEFAULT 'herdar'`,

  `ALTER TABLE cnc_ferramentas ADD COLUMN ciclo_vida_horas REAL DEFAULT 100`,
  `ALTER TABLE cnc_ferramentas ADD COLUMN custo_unitario REAL DEFAULT 0`,
  `ALTER TABLE cnc_ferramentas ADD COLUMN horas_uso REAL DEFAULT 0`,

  // ═══ #25 Auditoria de consumo de material ═══
  `CREATE TABLE IF NOT EXISTS cnc_material_consumo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapa_id INTEGER REFERENCES cnc_chapas(id),
    lote_id INTEGER REFERENCES cnc_lotes(id),
    chapa_idx INTEGER DEFAULT 0,
    material_code TEXT DEFAULT '',
    area_total_m2 REAL DEFAULT 0,
    area_usada_m2 REAL DEFAULT 0,
    area_sobra_m2 REAL DEFAULT 0,
    area_refugo_m2 REAL DEFAULT 0,
    aproveitamento REAL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ #29 Reserva de material no estoque ═══
  `CREATE TABLE IF NOT EXISTS cnc_reserva_material (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapa_id INTEGER REFERENCES cnc_chapas(id),
    lote_id INTEGER REFERENCES cnc_lotes(id),
    quantidade INTEGER DEFAULT 0,
    status TEXT DEFAULT 'reservado',
    expira_em DATETIME,
    user_id INTEGER REFERENCES users(id),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chapa_id, lote_id)
  )`,

  // ═══ #28 Backup automático metadata ═══
  `CREATE TABLE IF NOT EXISTS cnc_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT DEFAULT 'manual',
    arquivo TEXT DEFAULT '',
    tamanho_bytes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ok',
    user_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ #31 Performance de máquina ═══
  `CREATE TABLE IF NOT EXISTS cnc_maquina_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id INTEGER REFERENCES cnc_maquinas(id),
    lote_id INTEGER REFERENCES cnc_lotes(id),
    chapas_cortadas INTEGER DEFAULT 0,
    pecas_cortadas INTEGER DEFAULT 0,
    tempo_corte_min REAL DEFAULT 0,
    tempo_ocioso_min REAL DEFAULT 0,
    trocas_ferramenta INTEGER DEFAULT 0,
    defeitos INTEGER DEFAULT 0,
    data_registro DATE DEFAULT (date('now')),
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ═══ #38 Fotos vinculadas a peças (QR scan) ═══
  "ALTER TABLE cnc_pecas ADD COLUMN fotos_json TEXT DEFAULT '[]'",

  // ═══ #45 Webhooks ═══
  `CREATE TABLE IF NOT EXISTS cnc_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    url TEXT,
    eventos TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT
  )`,

  // ═══ #48 Rastreio entrega ═══
  `CREATE TABLE IF NOT EXISTS cnc_rastreio_entrega (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    volume_id INTEGER,
    lote_id INTEGER,
    tipo TEXT,
    lat REAL,
    lng REAL,
    observacao TEXT,
    motorista TEXT,
    created_at TEXT
  )`,

  // ═══ Aliases de material → chapa cadastrada ═══
  `CREATE TABLE IF NOT EXISTS cnc_chapa_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    material_code_importado TEXT NOT NULL,
    chapa_id INTEGER NOT NULL REFERENCES cnc_chapas(id) ON DELETE CASCADE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, material_code_importado)
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
  // ═══ Entrega Digital ═══
  "CREATE INDEX IF NOT EXISTS idx_entrega_fotos_projeto ON entrega_fotos(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_entrega_fotos_item ON entrega_fotos(projeto_id, ambiente_idx, item_idx)",
  // ═══ CNC Produção ═══
  "CREATE INDEX IF NOT EXISTS idx_cnc_lotes_user ON cnc_lotes(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_lotes_status ON cnc_lotes(status)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_pecas_lote ON cnc_pecas(lote_id)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_pecas_material ON cnc_pecas(material_code)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_retalhos_disp ON cnc_retalhos(disponivel)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_retalhos_material ON cnc_retalhos(material_code)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_ferramentas_maquina ON cnc_ferramentas(maquina_id)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_maquinas_user ON cnc_maquinas(user_id)",
  // Versionamento
  "CREATE INDEX IF NOT EXISTS idx_orc_versao ON orcamentos(parent_orc_id, tipo, versao)",
  // Projetista Visual (DESCONTINUADO)
  "CREATE INDEX IF NOT EXISTS idx_projetos_visual_user ON projetos_visual(user_id)",
  // Industrialização — Etapa 1
  "CREATE INDEX IF NOT EXISTS idx_cnc_lotes_projeto ON cnc_lotes(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_cnc_lotes_orc ON cnc_lotes(orc_id)",
  "CREATE INDEX IF NOT EXISTS idx_projeto_versoes_projeto ON projeto_versoes(projeto_id)",
  // Ordens de Produção — Etapa 2
  "CREATE INDEX IF NOT EXISTS idx_ordens_producao_projeto ON ordens_producao(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_producao_lote ON ordens_producao(lote_id)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_producao_status ON ordens_producao(status)",
  // Analytics — Section Views
  "CREATE INDEX IF NOT EXISTS idx_section_views_orc ON proposta_section_views(orc_id)",
  "CREATE INDEX IF NOT EXISTS idx_section_views_acesso ON proposta_section_views(acesso_id)",
  // Soft Delete — Financeiro
  "CREATE INDEX IF NOT EXISTS idx_contas_pagar_deletado ON contas_pagar(deletado)",
  "CREATE INDEX IF NOT EXISTS idx_contas_receber_deletado ON contas_receber(deletado)",
  "CREATE INDEX IF NOT EXISTS idx_despesas_deletado ON despesas_projeto(deletado)",
  // Custo Real
  "CREATE INDEX IF NOT EXISTS idx_custo_real_projeto ON custo_real_projeto(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_custo_real_orc ON custo_real_projeto(orc_id)",
  // Assinatura Eletrônica
  "CREATE INDEX IF NOT EXISTS idx_doc_assinaturas_orc ON documento_assinaturas(orc_id)",
  "CREATE INDEX IF NOT EXISTS idx_doc_assinaturas_token ON documento_assinaturas(token)",
  "CREATE INDEX IF NOT EXISTS idx_doc_assinaturas_codigo ON documento_assinaturas(codigo_verificacao)",
  "CREATE INDEX IF NOT EXISTS idx_assinatura_sig_doc ON assinatura_signatarios(documento_id)",
  "CREATE INDEX IF NOT EXISTS idx_assinatura_sig_token ON assinatura_signatarios(token)",
  // Compras
  "CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores(cnpj)",
  "CREATE INDEX IF NOT EXISTS idx_nf_entrada_fornecedor ON nf_entrada(fornecedor_id)",
  "CREATE INDEX IF NOT EXISTS idx_nf_entrada_projeto ON nf_entrada(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_nf_entrada_chave ON nf_entrada(chave_acesso)",
  "CREATE INDEX IF NOT EXISTS idx_nf_itens_nf ON nf_entrada_itens(nf_id)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_compra_fornecedor ON ordens_compra(fornecedor_id)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_compra_projeto ON ordens_compra(projeto_id)",
  // Produção
  "CREATE INDEX IF NOT EXISTS idx_producao_apontamentos_projeto ON producao_apontamentos(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_producao_apontamentos_etapa ON producao_apontamentos(etapa)",
  "CREATE INDEX IF NOT EXISTS idx_producao_qualidade_projeto ON producao_qualidade(projeto_id)",
  // Logística
  "CREATE INDEX IF NOT EXISTS idx_entregas_projeto ON entregas(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_agendada)",
  "CREATE INDEX IF NOT EXISTS idx_instalacoes_projeto ON instalacoes(projeto_id)",
  // Compliance
  "CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log(entidade, entidade_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, criado_em)",
  // Pessoas
  "CREATE INDEX IF NOT EXISTS idx_controle_ponto_colab ON controle_ponto(colaborador_id, data)",
  "CREATE INDEX IF NOT EXISTS idx_ferias_colab ON ferias_afastamentos(colaborador_id)",
  // NPS
  "CREATE INDEX IF NOT EXISTS idx_nps_projeto ON pesquisa_nps(projeto_id)",
  "CREATE INDEX IF NOT EXISTS idx_nps_token ON pesquisa_nps(token)",
];
for (const sql of indexes) {
  try { db.exec(sql); } catch (_) { }
}

// ═══ Índices adicionais de performance ═══
try {
  db.exec(`
    -- Clientes
    CREATE INDEX IF NOT EXISTS idx_clientes_user ON clientes(user_id);
    CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

    -- Orcamentos
    CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON orcamentos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_orcamentos_user ON orcamentos(user_id);
    CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON orcamentos(status);
    CREATE INDEX IF NOT EXISTS idx_orcamentos_criado ON orcamentos(criado_em);

    -- Projetos
    CREATE INDEX IF NOT EXISTS idx_projetos_cliente ON projetos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_projetos_user ON projetos(user_id);
    CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status);

    -- Etapas
    CREATE INDEX IF NOT EXISTS idx_etapas_projeto ON etapas_projeto(projeto_id, ordem);
    CREATE INDEX IF NOT EXISTS idx_etapas_responsavel ON etapas_projeto(responsavel_id);

    -- Financeiro
    CREATE INDEX IF NOT EXISTS idx_contas_pagar_user ON contas_pagar(user_id);
    CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
    CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(data_vencimento);
    CREATE INDEX IF NOT EXISTS idx_contas_pagar_projeto ON contas_pagar(projeto_id);
    CREATE INDEX IF NOT EXISTS idx_contas_receber_projeto ON contas_receber(projeto_id);
    CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status);
    CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON contas_receber(data_vencimento);

    -- Estoque
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_material ON estoque_movimentacoes(material_id);
    CREATE INDEX IF NOT EXISTS idx_estoque_mov_data ON estoque_movimentacoes(data);

    -- Chat
    CREATE INDEX IF NOT EXISTS idx_chat_conversas_cliente ON chat_conversas(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_chat_msgs_conversa ON chat_mensagens(conversa_id);

    -- Atividades
    CREATE INDEX IF NOT EXISTS idx_atividades_ref ON atividades(referencia_tipo, referencia_id);
    CREATE INDEX IF NOT EXISTS idx_atividades_user ON atividades(user_id);
    CREATE INDEX IF NOT EXISTS idx_atividades_criado ON atividades(criado_em);

    -- Notificacoes
    CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON notificacoes(user_id, lida);

    -- CNC
    CREATE INDEX IF NOT EXISTS idx_cnc_pecas_lote ON cnc_pecas(lote_id);
    CREATE INDEX IF NOT EXISTS idx_cnc_lotes_projeto ON cnc_lotes(projeto_id);

    -- Portal
    CREATE INDEX IF NOT EXISTS idx_portal_tokens_orc ON portal_tokens(orc_id);

    -- Montador
    CREATE INDEX IF NOT EXISTS idx_montador_tokens_projeto ON montador_tokens(projeto_id);
  `);
} catch (_) { /* tabelas podem não existir ainda */ }

// ═══ Modelagem Orgânica ═══
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materiais_modelagem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'mdf',
      espessura_padrao REAL NOT NULL DEFAULT 18,
      espessuras_disponiveis TEXT DEFAULT '[6,9,12,15,18,25]',
      raio_min_kerf_mm TEXT DEFAULT '{}',
      modulo_elasticidade REAL,
      custo_m2 REAL DEFAULT 0,
      largura_chapa_mm REAL DEFAULT 2750,
      comprimento_chapa_mm REAL DEFAULT 1850,
      permite_kerf INTEGER DEFAULT 1,
      permite_laminacao INTEGER DEFAULT 0,
      cor_hex TEXT DEFAULT '#D4B896',
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projetos_modelagem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      cliente_id INTEGER,
      orcamento_id INTEGER,
      nome TEXT NOT NULL,
      descricao TEXT DEFAULT '',
      codigo TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'rascunho',
      versao INTEGER NOT NULL DEFAULT 1,
      link_token TEXT UNIQUE,
      link_ativo INTEGER DEFAULT 0,
      link_expira_em DATETIME,
      aprovado_por TEXT,
      aprovado_em DATETIME,
      comentarios_cliente TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pecas_modelagem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id INTEGER NOT NULL REFERENCES projetos_modelagem(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materiais_modelagem(id),
      nome TEXT NOT NULL,
      descricao TEXT DEFAULT '',
      espessura REAL NOT NULL DEFAULT 18,
      geometria_silhueta TEXT DEFAULT '{}',
      bounding_box_x REAL,
      bounding_box_y REAL,
      area_real REAL,
      perimetro REAL,
      processo_fabricacao TEXT DEFAULT 'corte_2d',
      parametros_processo TEXT DEFAULT '{}',
      furos TEXT DEFAULT '[]',
      canaletas TEXT DEFAULT '[]',
      bordas TEXT DEFAULT '{}',
      fabricabilidade TEXT DEFAULT '{"valido":true,"problemas":[],"avisos":[]}',
      notas_operador TEXT DEFAULT '',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_proj_modelagem_user ON projetos_modelagem(user_id);
    CREATE INDEX IF NOT EXISTS idx_proj_modelagem_cliente ON projetos_modelagem(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_proj_modelagem_status ON projetos_modelagem(status);
    CREATE INDEX IF NOT EXISTS idx_proj_modelagem_token ON projetos_modelagem(link_token);
    CREATE INDEX IF NOT EXISTS idx_pecas_modelagem_projeto ON pecas_modelagem(projeto_id);
  `);

  // Seed materiais_modelagem
  const matCount = db.prepare('SELECT COUNT(*) as c FROM materiais_modelagem').get();
  if (matCount.c === 0) {
    const ins = db.prepare('INSERT INTO materiais_modelagem (nome, tipo, espessura_padrao, raio_min_kerf_mm, permite_kerf, cor_hex) VALUES (?,?,?,?,?,?)');
    ins.run('MDF Cru', 'mdf', 18, '{"6":80,"9":150,"12":220,"15":280,"18":350,"25":500}', 1, '#D4B896');
    ins.run('MDF Branco', 'mdf', 18, '{"6":80,"9":150,"12":220,"15":280,"18":350,"25":500}', 1, '#F0EBE0');
    ins.run('MDF Preto', 'mdf', 18, '{"6":80,"9":150,"12":220,"15":280,"18":350,"25":500}', 1, '#3a3a3a');
    ins.run('Compensado Naval', 'compensado', 15, '{"6":60,"9":120,"12":180,"15":250}', 1, '#C9A86C');
    ins.run('Vidro Temperado', 'vidro', 8, '{}', 0, '#C8E6F0');
    ins.run('MDF Amadeirado', 'mdf', 18, '{"6":80,"9":150,"12":220,"15":280,"18":350,"25":500}', 1, '#C4A672');
    ins.run('Madeira Macica', 'madeira_macica', 25, '{}', 0, '#A0785A');
    console.log('[OK] Seed materiais_modelagem: 7 materiais criados');
  }
} catch (e) { console.warn('Modelagem tables:', e.message); }

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

// Seed checkpoint padrão de Expedição
{
  const checkpointExists = db.prepare("SELECT id FROM cnc_expedicao_checkpoints WHERE nome = 'Expedição'").get();
  if (!checkpointExists) {
    db.prepare(`INSERT INTO cnc_expedicao_checkpoints (nome, ordem, cor, icone, ativo, obrigatorio)
      VALUES ('Expedição', 0, '#22c55e', 'package', 1, 1)`).run();
    console.log('[OK] Checkpoint padrão "Expedição" criado');
  }
}

// ═══════════════════════════════════════════════════════
// SEED — Usuário admin + config padrão
// ═══════════════════════════════════════════════════════
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@admin.com');
if (!adminExists) {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO users (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)').run('Administrador', 'admin@admin.com', hash, 'admin');
  if (adminPass === 'admin123') console.log('⚠️  Admin criado com senha padrão. Defina ADMIN_PASSWORD em produção!');
  else console.log('✓ Admin criado: admin@admin.com (senha via env)');
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

// Backfill: categoria nas ferragens que não têm (seed inicial não setava)
{
  const updates = [
    ['corr350',  'corrediça'], ['corr400',  'corrediça'], ['corr500',  'corrediça'], ['corrFH',   'corrediça'],
    ['dob110',   'dobradiça'], ['dob165',   'dobradiça'],
    ['pux128',   'puxador'],   ['pux160',   'puxador'],   ['pux256',   'puxador'],
  ];
  const upd = db.prepare("UPDATE biblioteca SET categoria = ? WHERE cod = ? AND (categoria IS NULL OR categoria = '')");
  let n = 0;
  for (const [cod, cat] of updates) { n += upd.run(cat, cod).changes; }
  if (n > 0) console.log(`[OK] Categoria atualizada em ${n} ferragem(ns)`);
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
    coef: 0.35, dimsAplicaveis: ['L','A','P'],
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
    coef: 0.30, dimsAplicaveis: ['L','A','P'],
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
    coef: 0.25, dimsAplicaveis: ['L','A','P'],
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
// MIGRATION — dimsAplicaveis para CAIXAS: analisar pecas e definir quais dims são usadas
// ═══════════════════════════════════════════════════════
{
  const rows = db.prepare("SELECT id, nome, json_data FROM modulos_custom WHERE tipo_item = 'caixa'").all();
  let migrated = 0;
  for (const row of rows) {
    const data = JSON.parse(row.json_data);
    if (data.dimsAplicaveis) continue; // já migrado
    const allCalcs = [...(data.pecas || []), ...(data.tamponamentos || [])].map(p => p.calc).join(' ');
    const dims = [];
    if (/\bL\b|\bLi\b/.test(allCalcs)) dims.push('L');
    if (/\bA\b|\bAi\b/.test(allCalcs)) dims.push('A');
    if (/\bP\b|\bPi\b/.test(allCalcs)) dims.push('P');
    data.dimsAplicaveis = dims;
    db.prepare('UPDATE modulos_custom SET json_data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    migrated++;
  }
  if (migrated > 0) console.log(`[OK] dimsAplicaveis: ${migrated} caixas migradas`);
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
        coef: 0.40, dimsAplicaveis: ['L','A','P'],
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

// ═══════════════════════════════════════════════════════
// MIGRATION FINAL — dimsAplicaveis: garante que TODAS as caixas tenham
// (roda após todos os seeds para pegar itens v3/v3.1/v3.2)
// ═══════════════════════════════════════════════════════
{
  const rows = db.prepare("SELECT id, nome, json_data FROM modulos_custom WHERE tipo_item = 'caixa'").all();
  let migrated = 0;
  for (const row of rows) {
    const data = JSON.parse(row.json_data);
    if (data.dimsAplicaveis) continue;
    const allCalcs = [...(data.pecas || []), ...(data.tamponamentos || [])].map(p => p.calc).join(' ');
    const dims = [];
    if (/\bL\b|\bLi\b/.test(allCalcs)) dims.push('L');
    if (/\bA\b|\bAi\b/.test(allCalcs)) dims.push('A');
    if (/\bP\b|\bPi\b/.test(allCalcs)) dims.push('P');
    if (dims.length === 0) dims.push('L', 'A', 'P');
    data.dimsAplicaveis = dims;
    db.prepare('UPDATE modulos_custom SET json_data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    migrated++;
  }
  if (migrated > 0) console.log(`[OK] dimsAplicaveis (final): ${migrated} caixas corrigidas`);
}

// ═══════════════════════════════════════════════════════
// SEED CNC — Máquinas, Chapas, Ferramentas e Config padrão
// ═══════════════════════════════════════════════════════
{
  // Máquina padrão
  const cncMaqCount = db.prepare('SELECT COUNT(*) as c FROM cnc_maquinas').get();
  let maquinaPadraoId = null;
  if (cncMaqCount.c === 0) {
    const r = db.prepare(`INSERT INTO cnc_maquinas (nome, fabricante, modelo, tipo_pos, padrao)
      VALUES ('CNC Principal', 'Genérico', 'Router CNC', 'generic', 1)`).run();
    maquinaPadraoId = Number(r.lastInsertRowid);
    console.log('[OK] CNC: máquina padrão criada');
  } else {
    const maq = db.prepare('SELECT id FROM cnc_maquinas WHERE padrao = 1 LIMIT 1').get();
    maquinaPadraoId = maq?.id || db.prepare('SELECT id FROM cnc_maquinas LIMIT 1').get()?.id;
  }

  // Chapas
  const cncChapaCount = db.prepare('SELECT COUNT(*) as c FROM cnc_chapas').get();
  if (cncChapaCount.c === 0) {
    const ins = db.prepare('INSERT INTO cnc_chapas (nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, preco) VALUES (?,?,?,?,?,?,?,?)');
    ins.run('MDF Branco TX 6mm',  'MDF_6.5_BRANCO_TX',  6,  6.5,  2750, 1850, 10, 85);
    ins.run('MDF Branco TX 15mm', 'MDF_15.5_BRANCO_TX', 15, 15.5, 2750, 1850, 10, 165);
    ins.run('MDF Branco TX 18mm', 'MDF_18.5_BRANCO_TX', 18, 18.5, 2750, 1850, 10, 195);
    console.log('[OK] CNC: 3 chapas padrão criadas');
  }

  // Ferramentas (vinculadas à máquina padrão)
  const cncFerrCount = db.prepare('SELECT COUNT(*) as c FROM cnc_ferramentas').get();
  if (cncFerrCount.c === 0 && maquinaPadraoId) {
    const ins = db.prepare('INSERT INTO cnc_ferramentas (maquina_id, codigo, nome, tipo, diametro, tool_code) VALUES (?,?,?,?,?,?)');
    ins.run(maquinaPadraoId, 'T01', 'Broca 15mm (minifix)',     'broca', 15, 'f_15mm_tambor_min');
    ins.run(maquinaPadraoId, 'T02', 'Broca 35mm (dobradiça)',   'broca', 35, 'f_35mm_dob');
    ins.run(maquinaPadraoId, 'T03', 'Broca 3mm',                'broca', 3,  'f_3mm');
    ins.run(maquinaPadraoId, 'T04', 'Broca 5mm (twister)',      'broca', 5,  'f_5mm_twister243');
    ins.run(maquinaPadraoId, 'T05', 'Broca 8mm (cavilha)',      'broca', 8,  'f_8mm_cavilha');
    ins.run(maquinaPadraoId, 'T06', 'Broca 8mm (eixo minifix)', 'broca', 8,  'f_8mm_eixo_tambor_min');
    ins.run(maquinaPadraoId, 'T07', 'Pocket 3mm',               'fresa', 3,  'p_3mm');
    ins.run(maquinaPadraoId, 'T08', 'Pocket 8mm (cavilha)',     'fresa', 8,  'p_8mm_cavilha');
    ins.run(maquinaPadraoId, 'T09', 'Serra rasgo fundo',        'serra', 7,  'r_f');
    console.log('[OK] CNC: 9 ferramentas CNC criadas');
  }

  // Tipos de usinagem (prioridades centralizadas)
  const usiTipoCount = db.prepare('SELECT COUNT(*) as c FROM cnc_usinagem_tipos').get();
  if (usiTipoCount.c === 0) {
    const insU = db.prepare('INSERT INTO cnc_usinagem_tipos (codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao) VALUES (?,?,?,?,?,?,?,?,?)');
    insU.run('rasgo_fundo',       'Rasgo de Fundo',       'Transfer_vertical_saw_cut,Transfer_horizontal_saw_cut,saw_cut', null, 0, 'interna', 'r_f', 6, 3);
    insU.run('rasgo_led',         'Rasgo de LED',          'led_groove,rasgo_led', null, 1, 'interna', 'r_f', 8, 8);
    insU.run('rasgo_gaveta',      'Rasgo de Gaveta',       'rasgo_gaveta,drawer_groove', null, 2, 'interna', 'r_f', 12.5, 12.7);
    insU.run('rebaixo',           'Rebaixo',               'rebaixo', null, 3, 'interna', 'r_f', 3, null);
    insU.run('pocket',            'Pocket / Fresagem',     'pocket', null, 3, 'interna', '', null, null);
    insU.run('furacao_minifix',   'Furação Minifix',       'hole,transfer_hole', 15, 4, 'interna', 'f_15mm_tambor_min', 13, null);
    insU.run('furacao_dobradica', 'Furação Dobradiça',     'hole,transfer_hole', 35, 5, 'interna', 'f_35mm_dob', 13, null);
    insU.run('furacao_cavilha',   'Furação Cavilha',       'hole,transfer_hole', 8, 6, 'interna', 'f_8mm_cavilha', 12, null);
    insU.run('furacao_generica',  'Furação Genérica',      'hole,transfer_hole', null, 6, 'interna', '', null, null);
    insU.run('fresamento_caminho', 'Fresamento de Caminho', 'transfer_milling', null, 3, 'interna', '', null, null);
    insU.run('chanfro',           'Chanfro 45°',           'chanfro', null, 7, 'interna', 'chanfro_45', null, null);
    insU.run('contorno_peca',     'Contorno da Peça',      'contorno,contorno_peca', null, 8, 'contorno', '', null, null);
    insU.run('contorno_sobra',    'Contorno de Sobra',     'contorno_sobra', null, 9, 'contorno', '', null, null);
    console.log('[OK] CNC: 13 tipos de usinagem criados');
  }

  // Migração: adicionar tipos de usinagem faltantes (transfer_milling, chanfro) em DBs existentes
  {
    const insIfMissing = (codigo, nome, catMatch, diamMatch, prio, fase, tcPadrao, profPadrao, largPadrao) => {
      const exists = db.prepare('SELECT COUNT(*) as c FROM cnc_usinagem_tipos WHERE codigo = ?').get(codigo);
      if (exists.c === 0) {
        db.prepare('INSERT INTO cnc_usinagem_tipos (codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(codigo, nome, catMatch, diamMatch, prio, fase, tcPadrao, profPadrao, largPadrao);
        console.log(`[OK] CNC: tipo usinagem '${codigo}' adicionado`);
      }
    };
    insIfMissing('fresamento_caminho', 'Fresamento de Caminho', 'transfer_milling', null, 3, 'interna', '', null, null);
    insIfMissing('chanfro', 'Chanfro 45°', 'chanfro', null, 7, 'interna', 'chanfro_45', null, null);
  }

  // Migração: vincular ferramentas órfãs à máquina padrão
  if (maquinaPadraoId) {
    const orfas = db.prepare('SELECT COUNT(*) as c FROM cnc_ferramentas WHERE maquina_id IS NULL').get();
    if (orfas.c > 0) {
      db.prepare('UPDATE cnc_ferramentas SET maquina_id = ? WHERE maquina_id IS NULL').run(maquinaPadraoId);
      console.log(`[OK] CNC: ${orfas.c} ferramenta(s) vinculada(s) à máquina padrão`);
    }
  }

  // Config
  const cncCfgExists = db.prepare('SELECT id FROM cnc_config WHERE id = 1').get();
  if (!cncCfgExists) {
    db.prepare('INSERT INTO cnc_config (id) VALUES (1)').run();
    console.log('[OK] CNC: config padrão criada');
  }

  // Config de Etiquetas
  const etCfgExists = db.prepare('SELECT id FROM cnc_etiqueta_config WHERE id = 1').get();
  if (!etCfgExists) {
    db.prepare('INSERT INTO cnc_etiqueta_config (id) VALUES (1)').run();
    console.log('[OK] CNC: config de etiquetas criada');
  }

  // Template padrão de etiquetas (replica o EtiquetaCard atual)
  const templateExists = db.prepare('SELECT id FROM cnc_etiqueta_templates LIMIT 1').get();
  if (!templateExists) {
    const elementosPadrao = JSON.stringify([
      // Header: empresa + controle
      { id: 'el_hdr_empresa', tipo: 'texto', x: 2, y: 2, w: 60, h: 5, texto: '{{empresa_nome}}', variavel: 'empresa_nome', fontSize: 3, fontWeight: 700, cor: '#e67e22', alinhamento: 'start', zIndex: 10 },
      { id: 'el_hdr_ctrl_bg', tipo: 'retangulo', x: 80, y: 1, w: 18, h: 7, preenchimento: '#e67e22', raio: 1.5, zIndex: 5 },
      { id: 'el_hdr_ctrl', tipo: 'texto', x: 89, y: 6, w: 16, h: 5, texto: '{{controle}}', variavel: 'controle', fontSize: 4, fontWeight: 800, cor: '#ffffff', alinhamento: 'middle', zIndex: 11 },
      // Linha separadora
      { id: 'el_sep1', tipo: 'retangulo', x: 1, y: 9, w: 98, h: 0.3, preenchimento: '#e5e7eb', zIndex: 3 },
      // Usi A / Usi B
      { id: 'el_lbl_usia', tipo: 'texto', x: 2, y: 12, w: 12, h: 3, texto: 'UsiA:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_usia', tipo: 'texto', x: 14, y: 12, w: 30, h: 3, texto: '{{usi_a}}', variavel: 'usi_a', fontSize: 2.2, fontWeight: 700, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      { id: 'el_lbl_usib', tipo: 'texto', x: 50, y: 12, w: 12, h: 3, texto: 'UsiB:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_usib', tipo: 'texto', x: 62, y: 12, w: 30, h: 3, texto: '{{usi_b}}', variavel: 'usi_b', fontSize: 2.2, fontWeight: 700, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      // Material + Espessura
      { id: 'el_lbl_mat', tipo: 'texto', x: 2, y: 17, w: 15, h: 3, texto: 'Material:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_mat', tipo: 'texto', x: 18, y: 17, w: 50, h: 3, texto: '{{material}}', variavel: 'material', fontSize: 2.2, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_esp', tipo: 'texto', x: 75, y: 17, w: 23, h: 3, texto: '{{espessura}}mm', variavel: 'espessura', fontSize: 2.2, fontWeight: 700, cor: '#2563eb', alinhamento: 'end', zIndex: 10 },
      // Cliente + Projeto
      { id: 'el_lbl_cli', tipo: 'texto', x: 2, y: 22, w: 12, h: 3, texto: 'Cliente:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_cli', tipo: 'texto', x: 14, y: 22, w: 30, h: 3, texto: '{{cliente}}', variavel: 'cliente', fontSize: 2.2, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      { id: 'el_lbl_proj', tipo: 'texto', x: 50, y: 22, w: 12, h: 3, texto: 'Projeto:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_proj', tipo: 'texto', x: 62, y: 22, w: 36, h: 3, texto: '{{projeto}}', variavel: 'projeto', fontSize: 2.2, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      // Módulo + Peça
      { id: 'el_lbl_mod', tipo: 'texto', x: 2, y: 27, w: 12, h: 3, texto: 'Módulo:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_mod', tipo: 'texto', x: 14, y: 27, w: 30, h: 3, texto: '{{modulo_desc}}', variavel: 'modulo_desc', fontSize: 2.2, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      { id: 'el_lbl_peca', tipo: 'texto', x: 50, y: 27, w: 12, h: 3, texto: 'Peça:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_peca', tipo: 'texto', x: 62, y: 27, w: 36, h: 3, texto: '{{descricao}}', variavel: 'descricao', fontSize: 2.2, fontWeight: 700, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      // Dimensões
      { id: 'el_lbl_dim', tipo: 'texto', x: 2, y: 32, w: 12, h: 3, texto: 'Dim:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_dim', tipo: 'texto', x: 14, y: 32, w: 40, h: 3, texto: '{{dimensoes}}', variavel: 'dimensoes', fontSize: 2.5, fontWeight: 700, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      // Acabamento
      { id: 'el_lbl_acab', tipo: 'texto', x: 60, y: 32, w: 12, h: 3, texto: 'Acab:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_acab', tipo: 'texto', x: 72, y: 32, w: 26, h: 3, texto: '{{acabamento}}', variavel: 'acabamento', fontSize: 2.2, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      // Linha separadora 2
      { id: 'el_sep2', tipo: 'retangulo', x: 1, y: 36, w: 98, h: 0.3, preenchimento: '#e5e7eb', zIndex: 3 },
      // Diagrama de bordas + Fita resumo + Barcode
      { id: 'el_diagrama', tipo: 'diagrama_bordas', x: 2, y: 38, w: 18, h: 16, diagramaCor: '#22c55e', zIndex: 10 },
      { id: 'el_lbl_fita', tipo: 'texto', x: 22, y: 39, w: 12, h: 3, texto: 'Fita:', fontSize: 2, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      { id: 'el_val_fita', tipo: 'texto', x: 22, y: 43, w: 40, h: 3, texto: '{{fita_resumo}}', variavel: 'fita_resumo', fontSize: 1.8, fontWeight: 600, cor: '#111827', alinhamento: 'start', zIndex: 10 },
      { id: 'el_barcode', tipo: 'barcode', x: 55, y: 38, w: 35, h: 12, barcodeVariavel: 'controle', zIndex: 10 },
      // ID Módulo no canto inferior
      { id: 'el_val_idmod', tipo: 'texto', x: 22, y: 49, w: 20, h: 3, texto: 'Mod: {{modulo_id}}', variavel: 'modulo_id', fontSize: 1.8, fontWeight: 600, cor: '#6b7280', alinhamento: 'start', zIndex: 10 },
      // Borda externa
      { id: 'el_borda_ext', tipo: 'retangulo', x: 0.5, y: 0.5, w: 99, h: 69, preenchimento: 'none', bordaCor: '#d1d5db', bordaLargura: 0.3, raio: 1.5, zIndex: 1 },
    ]);
    db.prepare('INSERT INTO cnc_etiqueta_templates (user_id, nome, largura, altura, elementos, padrao) VALUES (1, ?, 100, 70, ?, 1)')
      .run('Etiqueta Padrão', elementosPadrao);
    console.log('[OK] CNC: template padrão de etiquetas criado');
  }
}

export default db;
