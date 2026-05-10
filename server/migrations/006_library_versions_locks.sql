-- Migração 006: Histórico de versões + Locks de checkout (LIB-EDIT)
-- Idempotente — pode ser aplicada múltiplas vezes
-- Aplicar local: sqlite3 server/marcenaria.db < server/migrations/006_library_versions_locks.sql
-- Aplicar VPS  : sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/006_library_versions_locks.sql

-- ── Histórico de versões de cada módulo ────────────────────────────────
CREATE TABLE IF NOT EXISTS library_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  version TEXT NOT NULL,                -- ex: "1.0.14", "1.0.14-draft"
  status TEXT NOT NULL CHECK(status IN ('draft','published','rolled_back')),
  channel TEXT NOT NULL,
  json_snapshot TEXT NOT NULL,          -- conteúdo do JSON na época
  asset_paths TEXT,                     -- JSON array de paths .skp
  thumbnail_path TEXT,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER,
  created_by INTEGER,                   -- user_id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(module_id, version)
);
CREATE INDEX IF NOT EXISTS idx_lib_versions ON library_versions(module_id, created_at DESC);

-- ── Locks de checkout (lease com TTL) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS library_locks (
  module_id TEXT PRIMARY KEY,
  locked_by INTEGER NOT NULL,           -- user_id
  locked_by_name TEXT,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_lib_locks_expires ON library_locks(expires_at);

-- ── Audit log (force unlock, rollbacks etc) ───────────────────────────
CREATE TABLE IF NOT EXISTS library_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,                 -- checkout|checkin|release|force_unlock|rollback|export|import
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lib_audit_module ON library_audit(module_id, created_at DESC);
