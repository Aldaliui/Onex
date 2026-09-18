-- ONEX D1 production migration 0019
-- Non-secret system setup metadata used by the dashboard and setup center.
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId INTEGER NOT NULL UNIQUE,
  engine TEXT NOT NULL DEFAULT 'mysql',
  host TEXT,
  port INTEGER DEFAULT 3306,
  databaseName TEXT,
  ssl INTEGER NOT NULL DEFAULT 1,
  updatedBy TEXT NOT NULL DEFAULT 'system',
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO system_settings(companyId, engine, ssl) VALUES (1, 'mysql', 1);
INSERT OR IGNORE INTO _onex_migration_log(name) VALUES ('0019_system_settings');
