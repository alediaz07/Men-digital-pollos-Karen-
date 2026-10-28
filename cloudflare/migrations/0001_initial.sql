-- Pollos Karen | D1 schema v1. Ejecutar SOLO mediante migraciones Wrangler.
-- No borrar las tablas existentes ni sembrar credenciales por defecto.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pk_settings (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pk_menu (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pk_tables (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  qr_token_hash TEXT UNIQUE NOT NULL,
  qr_token TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS pk_staff (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','reception','kitchen')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pk_sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id TEXT REFERENCES pk_staff(id) ON DELETE CASCADE,
  client_id TEXT,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK(staff_id IS NOT NULL OR client_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_pk_sessions_expiry ON pk_sessions(expires_at);

CREATE TABLE IF NOT EXISTS pk_orders (
  order_number INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL CHECK(order_type IN ('dine_in','express','window')),
  table_id TEXT REFERENCES pk_tables(id) ON DELETE RESTRICT,
  customer_owner_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending_reception',
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK(is_paid IN (0,1)),
  total INTEGER NOT NULL CHECK(total >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pk_orders_table_open ON pk_orders(table_id,is_paid,status);
CREATE INDEX IF NOT EXISTS ix_pk_orders_status ON pk_orders(status,created_at);
CREATE INDEX IF NOT EXISTS ix_pk_orders_client ON pk_orders(customer_owner_hash,created_at);

CREATE TABLE IF NOT EXISTS pk_idempotency (
  owner_hash TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES pk_orders(id) ON DELETE CASCADE,
  PRIMARY KEY(owner_hash,request_key)
);

CREATE TABLE IF NOT EXISTS pk_receipts (
  order_id TEXT PRIMARY KEY REFERENCES pk_orders(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
  image_bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pk_payments (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  method TEXT NOT NULL CHECK(method IN ('efectivo','sinpe','tarjeta')),
  cash_received INTEGER,
  change_given INTEGER,
  bank_reference TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pk_payment_orders (
  payment_id TEXT NOT NULL REFERENCES pk_payments(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL UNIQUE REFERENCES pk_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY(payment_id,order_id)
);

CREATE TABLE IF NOT EXISTS pk_audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  order_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pk_audit_date ON pk_audit(created_at);

-- Inventario no está en operación. No se crean reglas de descuento.
