-- Migração 004: Biblioteca de módulos paramétricos (Sprint B1)
-- Idempotente — pode ser aplicada múltiplas vezes
-- Aplicar local : sqlite3 server/marcenaria.db < server/migrations/004_library_modules.sql
-- Aplicar VPS  : sqlite3 /home/ornato/app/server/marcenaria.db < server/migrations/004_library_modules.sql

CREATE TABLE IF NOT EXISTS library_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('dev','beta','stable')),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','deprecated')),
  json_path TEXT NOT NULL,
  skp_refs TEXT,           -- JSON array de paths .skp
  thumbnail_path TEXT,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  tags TEXT,
  largura_min INTEGER, largura_max INTEGER,
  altura_min INTEGER, altura_max INTEGER,
  profundidade_min INTEGER, profundidade_max INTEGER,
  n_portas INTEGER, n_gavetas INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_library_channel_status ON library_modules(channel, status);
CREATE INDEX IF NOT EXISTS idx_library_category       ON library_modules(category);
CREATE INDEX IF NOT EXISTS idx_library_updated        ON library_modules(updated_at);

-- Versão global da biblioteca (incrementada a cada seed/import)
CREATE TABLE IF NOT EXISTS library_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO library_meta (key, value) VALUES ('library_version', '1.0.0');

-- Full-text search (FTS5) sobre name+category+tags
CREATE VIRTUAL TABLE IF NOT EXISTS library_modules_fts USING fts5(
  id UNINDEXED,
  name,
  category,
  tags,
  content='library_modules',
  content_rowid='rowid'
);

-- Triggers de sync FTS
CREATE TRIGGER IF NOT EXISTS library_modules_ai AFTER INSERT ON library_modules BEGIN
  INSERT INTO library_modules_fts(rowid, id, name, category, tags)
  VALUES (new.rowid, new.id, new.name, new.category, COALESCE(new.tags, ''));
END;
CREATE TRIGGER IF NOT EXISTS library_modules_ad AFTER DELETE ON library_modules BEGIN
  INSERT INTO library_modules_fts(library_modules_fts, rowid, id, name, category, tags)
  VALUES ('delete', old.rowid, old.id, old.name, old.category, COALESCE(old.tags, ''));
END;
CREATE TRIGGER IF NOT EXISTS library_modules_au AFTER UPDATE ON library_modules BEGIN
  INSERT INTO library_modules_fts(library_modules_fts, rowid, id, name, category, tags)
  VALUES ('delete', old.rowid, old.id, old.name, old.category, COALESCE(old.tags, ''));
  INSERT INTO library_modules_fts(rowid, id, name, category, tags)
  VALUES (new.rowid, new.id, new.name, new.category, COALESCE(new.tags, ''));
END;
