-- Migração 007: Variações de blocos por marcenaria (LIB-VARIATION)
-- Cada empresa pode duplicar bloco global e customizar mantendo vínculo
-- com a origem para receber notificações de atualizações.
--
-- Idempotente — pode ser aplicada múltiplas vezes (ALTER falha silencioso
-- se coluna já existe; SQLite não suporta IF NOT EXISTS em ALTER COLUMN).
--
-- Aplicar local : sqlite3 server/marcenaria.db < server/migrations/007_library_variations.sql
-- Aplicar VPS   : sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/007_library_variations.sql

-- ── Colunas de variação em library_modules ──────────────────────────────
-- Em SQLite ALTER TABLE não tem IF NOT EXISTS. Estas linhas falham silencioso
-- se rodadas duas vezes (SQLite reporta "duplicate column" e o sqlite3 CLI
-- continua a próxima sentença com .timeout 0; nosso loader de db.js já
-- usa try/catch globalmente).
ALTER TABLE library_modules ADD COLUMN derived_from TEXT;
ALTER TABLE library_modules ADD COLUMN derived_from_version TEXT;
ALTER TABLE library_modules ADD COLUMN org_id INTEGER;
ALTER TABLE library_modules ADD COLUMN visibility TEXT NOT NULL DEFAULT 'global';

-- Índice composto para query do manifest filtrar global + variações da org
CREATE INDEX IF NOT EXISTS idx_library_org_visibility
  ON library_modules(visibility, org_id, channel, status);

CREATE INDEX IF NOT EXISTS idx_library_derived_from
  ON library_modules(derived_from);

-- ── Notificações de atualização de origem ─────────────────────────────
-- Quando a versão stable de um bloco global muda, gravamos uma row aqui
-- pra cada variação derivada. Curator/admin da org vê e decide aplicar
-- ou ignorar.
CREATE TABLE IF NOT EXISTS library_origin_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variation_module_id TEXT NOT NULL,
  origin_module_id TEXT NOT NULL,
  origin_old_version TEXT,
  origin_new_version TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME,
  acknowledged_by INTEGER,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','applied','dismissed','superseded'))
);

CREATE INDEX IF NOT EXISTS idx_library_origin_updates
  ON library_origin_updates(variation_module_id, status);

CREATE INDEX IF NOT EXISTS idx_library_origin_updates_origin
  ON library_origin_updates(origin_module_id, status);
