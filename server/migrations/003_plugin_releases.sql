-- Migração 003: Sistema de releases / telemetry / error reports do plugin SketchUp
-- Idempotente — pode ser aplicada múltiplas vezes
-- Aplicar local : sqlite3 server/marcenaria.db < server/migrations/003_plugin_releases.sql
-- Aplicar VPS  : sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/003_plugin_releases.sql

CREATE TABLE IF NOT EXISTS plugin_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('dev','beta','stable')),
  status TEXT NOT NULL CHECK(status IN ('draft','published','deprecated')),
  rbz_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  changelog TEXT,
  force_update INTEGER DEFAULT 0,
  min_compat TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME,
  UNIQUE(version, channel)
);
CREATE INDEX IF NOT EXISTS idx_plugin_releases_channel ON plugin_releases(channel, status);

CREATE TABLE IF NOT EXISTS plugin_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id TEXT NOT NULL,
  plugin_version TEXT,
  os TEXT,
  sketchup_version TEXT,
  locale TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_telemetry_install ON plugin_telemetry(install_id, created_at);

CREATE TABLE IF NOT EXISTS plugin_error_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL UNIQUE,
  install_id TEXT,
  plugin_version TEXT,
  error_class TEXT,
  message TEXT,
  stack TEXT,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_errors_install ON plugin_error_reports(install_id, created_at);
