import pathlib
import sqlite3

schema = pathlib.Path("cloudflare/migrations/0001_initial.sql").read_text()
db = sqlite3.connect(":memory:")
db.executescript(schema)
names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required = {"pk_settings","pk_menu","pk_tables","pk_staff","pk_sessions","pk_orders","pk_payments","pk_payment_orders","pk_receipts","pk_audit","pk_auth_attempts"}
assert required <= names, required - names
db.execute("INSERT INTO pk_orders(order_number,id,order_type,status,is_paid,total,created_at,updated_at,json) VALUES(1,'order-test','window','ready',0,3000,'2026','2026','{}')")
db.execute("INSERT INTO pk_payments(id,actor,amount,method,created_at) VALUES('payment-1','admin',3000,'efectivo','2026')")
db.execute("INSERT INTO pk_payment_orders(payment_id,order_id) VALUES('payment-1','order-test')")
db.execute("UPDATE pk_orders SET is_paid=1 WHERE id='order-test'")
db.execute("INSERT INTO pk_payments(id,actor,amount,method,created_at) VALUES('payment-2','admin',3000,'efectivo','2026')")
try:
    db.execute("INSERT INTO pk_payment_orders(payment_id,order_id) VALUES('payment-2','order-test')")
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("No se bloqueó el segundo cobro")
print("D1 schema OK")
