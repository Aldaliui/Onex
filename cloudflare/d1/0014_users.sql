CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSignedIn TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

INSERT OR IGNORE INTO users (openId, name, email, loginMethod, role)
VALUES ('cloud-user', 'مدير النظام', 'admin@onex.local', 'cloud-worker', 'admin');

INSERT OR IGNORE INTO _onex_migration_log(name)
VALUES ('0014_users');
