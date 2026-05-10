-- Migração 005: Shop Profiles — padrões técnicos por marcenaria (Sprint SHOP-2)
-- Idempotente — pode ser aplicada múltiplas vezes
-- Aplicar local : sqlite3 server/marcenaria.db < server/migrations/005_shop_profiles.sql
-- Aplicar VPS  : sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/005_shop_profiles.sql
--
-- NOTA: "org_id" aqui mapeia para users.empresa_id (multi-tenant). O nome do
-- campo segue o vocabulário do plugin Ruby (shop_config), mas o valor vem do
-- JWT.empresa_id setado em auth.js (ver tenantOf()).

CREATE TABLE IF NOT EXISTS shop_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  is_active INTEGER NOT NULL DEFAULT 1,

  -- Bordas/folgas
  folga_porta_lateral REAL DEFAULT 2.0,
  folga_porta_vertical REAL DEFAULT 2.0,
  folga_entre_portas REAL DEFAULT 3.0,
  folga_porta_reta REAL DEFAULT 3.0,
  folga_porta_dupla REAL DEFAULT 3.0,
  folga_gaveta REAL DEFAULT 2.0,

  -- Fundos/recuos
  recuo_fundo REAL DEFAULT 13.0,
  profundidade_rasgo_fundo REAL DEFAULT 8.0,
  largura_rasgo_fundo REAL DEFAULT 6.0,

  -- Rodapé
  altura_rodape REAL DEFAULT 100.0,
  rodape_altura_padrao REAL DEFAULT 100.0,

  -- Espessuras
  espessura REAL DEFAULT 18.0,
  espessura_padrao REAL DEFAULT 18.0,
  espessura_chapa_padrao REAL DEFAULT 18.0,

  -- System32
  sistema32_offset REAL DEFAULT 37.0,
  sistema32_passo REAL DEFAULT 32.0,
  sistema32_ativo INTEGER DEFAULT 1,

  -- Cavilha
  cavilha_diametro REAL DEFAULT 8.0,
  cavilha_profundidade REAL DEFAULT 15.0,

  -- Hardware/material defaults
  dobradica_padrao TEXT DEFAULT 'amor_cj',
  corredica_padrao TEXT DEFAULT 'telescopica',
  puxador_padrao TEXT DEFAULT 'galla_128mm',
  minifix_padrao TEXT DEFAULT 'standard',
  fita_borda_padrao TEXT DEFAULT 'BOR_04x22_Branco',
  material_carcaca_padrao TEXT DEFAULT 'MDF18_BrancoTX',
  material_frente_padrao TEXT DEFAULT 'MDF18_BrancoTX',
  material_fundo_padrao TEXT DEFAULT 'MDF6_Branco',

  -- Misc/JSON pra extensões custom
  custom_keys TEXT,  -- JSON {"chave_custom":"valor"}

  -- Audit
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shop_org ON shop_profiles(org_id, is_active);

-- Seed default profile pra empresa_id=1 (admin master)
INSERT OR IGNORE INTO shop_profiles (org_id, name, is_active) VALUES (1, 'default', 1);
