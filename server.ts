import { randomUUID, createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import {
  loadStore,
  writeStore,
  acquireLock,
  type Store,
} from "./backend/store.ts";
import {
  digest,
  token,
  hashPassword,
  verifyPassword,
  type Role,
} from "./backend/security.ts";
import {
  CategoryId,
  OrderType,
  OrderStatus,
  PaymentMethod,
  type Order,
  type MenuItem,
} from "./src/types.ts";

const production = process.env.NODE_ENV === "production";
if (production && process.env.TEST_MODE === "true")
  throw new Error("TEST_MODE no está permitido en producción.");
if (
  production &&
  (!process.env.PUBLIC_ORIGIN?.startsWith("https://") ||
    !process.env.DATA_DIR ||
    process.env.DURABLE_STORAGE_CONFIRMED !== "true")
)
  throw new Error(
    "Producción requiere PUBLIC_ORIGIN HTTPS, DATA_DIR absoluto en volumen duradero y DURABLE_STORAGE_CONFIRMED=true.",
  );
if (production && !path.isAbsolute(process.env.DATA_DIR!))
  throw new Error("DATA_DIR debe ser absoluto.");
const releaseLock = acquireLock();
process.on("exit", releaseLock);
let store = loadStore();
const app = express();
app.disable("x-powered-by");
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const sessions = new Map<
  string,
  { userId: string; version: number; expires: number }
>();
const clients = new Map<WebSocket, IncomingMessage>();
const alive = new WeakSet<WebSocket>();
const attempts = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + windowMs };
    attempts.set(key, entry);
  }
  return ++entry.count <= max;
}
setInterval(() => {
  for (const [k, v] of attempts) if (v.until < Date.now()) attempts.delete(k);
  for (const [k, v] of sessions) if (v.expires < Date.now()) sessions.delete(k);
}, 60000).unref();
function cookie(req: IncomingMessage, name: string) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
function staff(req: IncomingMessage) {
  const s = sessions.get(digest(cookie(req, "karen_staff")));
  if (!s || s.expires <= Date.now()) return undefined;
  return store.users.find(
    (u) => u.id === s.userId && u.version === s.version && u.active,
  );
}
function owner(req: IncomingMessage) {
  const value = cookie(req, "karen_customer");
  return /^[\w-]{43}$/.test(value) ? digest(value) : "";
}
function csrf(req: IncomingMessage) {
  return createHmac("sha256", store.csrfSecret)
    .update(cookie(req, "karen_customer"))
    .digest("hex");
}
function sameOrigin(req: IncomingMessage) {
  const expected = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
  return req.headers.origin === expected;
}
function setCookie(
  res: express.Response,
  name: string,
  value: string,
  maxAge: number,
) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function text(value: unknown, max = 200, required = false): string | undefined {
  if (value == null && !required) return undefined;
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("Texto requerido o longitud inválida.");
  return (value as string).trim();
}
function money(v: unknown) {
  if (
    typeof v !== "number" ||
    !Number.isSafeInteger(v) ||
    v < 0 ||
    v > 10000000
  )
    fail("Importe inválido.");
  return v as number;
}
function permit(...roles: Role[]): express.RequestHandler {
  return (req, _res, next) => {
    const user = staff(req);
    if (!user)
      return next(Object.assign(new Error("Inicia sesión."), { status: 401 }));
    if (!roles.includes(user.role))
      return next(Object.assign(new Error("Sin permisos."), { status: 403 }));
    next();
  };
}
const admin = permit("admin");
const operations = permit("admin", "reception", "kitchen");
function publicOrder(o: Order) {
  const { ownerHash, requestKey, requestHash, sinpeReceiptImage, ...safe } = o;
  return safe;
}
function operationalOrder(o: Order) {
  const { ownerHash, requestKey, requestHash, ...safe } = o;
  return {
    ...safe,
    sinpeReceiptImage: o.sinpeReceiptImage
      ? `/api/orders/${o.id}/receipt`
      : undefined,
  };
}
function kitchenOrder(o: Order) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    tableName: o.tableName,
    items: o.items.map(
      ({ id, menuItemId, name, quantity, selectedVariant, notes }) => ({
        id,
        menuItemId,
        name,
        quantity,
        selectedVariant,
        notes,
      }),
    ),
    status: o.status,
    createdAt: o.createdAt,
    sentToKitchenAt: o.sentToKitchenAt,
    readyAt: o.readyAt,
  };
}
function state(req: IncomingMessage) {
  const scope = new URL(req.url || "/", "http://local").searchParams.get(
    "scope",
  );
  const user = scope === "customer" ? undefined : staff(req);
  const customer = owner(req);
  const visibleOrders = store.orders.filter(
    (o) => !o.isTest || process.env.TEST_MODE === "true",
  );
  if (user?.role === "kitchen")
    return {
      menu: [],
      tables: [],
      settings: { restaurantName: store.settings.restaurantName },
      orders: visibleOrders
        .filter((o) =>
          [OrderStatus.IN_KITCHEN, OrderStatus.READY].includes(o.status),
        )
        .map(kitchenOrder),
      revision: store.revision,
    };
  return {
    menu: store.menu,
    settings: store.settings,
    tables: user?.role === "admin" ? store.tables : [],
    orders: user
      ? visibleOrders.map(operationalOrder)
      : visibleOrders
          .filter((o) => customer && o.ownerHash === customer)
          .map(publicOrder),
    revision: store.revision,
  };
}
function sync() {
  for (const [ws, req] of clients)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "state:sync", payload: state(req) }));
}
function commit(change: (next: Store) => void) {
  const next = structuredClone(store);
  change(next);
  next.revision++;
  writeStore(next);
  store = next;
  sync();
}
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (!owner(req) || !sameOrigin(req) || req.get("X-CSRF-Token") !== csrf(req))
  )
    return next(
      Object.assign(
        new Error("Solicitud no autorizada (CSRF). Recarga la página."),
        { status: 403 },
      ),
    );
  next();
});
app.get("/api/session", (req, res) => {
  if (!owner(req)) {
    const value = token();
    setCookie(res, "karen_customer", value, 90 * 86400000);
    req.headers.cookie = `${req.headers.cookie || ""}; karen_customer=${value}`;
  }
  const u = staff(req);
  res.json({
    user: u ? { username: u.username, role: u.role } : null,
    csrfToken: csrf(req),
  });
});
app.post("/api/login", async (req, res, next) => {
  try {
    const username = text(req.body.username, 80, true)!.toLowerCase();
    if (typeof req.body.password !== "string" || req.body.password.length > 128)
      fail("Credenciales inválidas.", 401);
    const password = req.body.password;
    if (
      !limit(`ip:${req.socket.remoteAddress}`, 30, 900000) ||
      !limit(`login:${username}`, 8, 900000)
    )
      fail("Demasiados intentos. Espera 15 minutos.", 429);
    const u = store.users.find((u) => u.username === username && u.active);
    // Always derive a hash, including unknown accounts, to reduce account enumeration.
    const valid = await verifyPassword(
      password,
      u?.passwordHash || `${"x".repeat(43)}:${"0".repeat(128)}`,
    );
    if (!u || !valid) fail("Usuario o contraseña incorrectos.", 401);
    sessions.delete(digest(cookie(req, "karen_staff")));
    const value = token();
    sessions.set(digest(value), {
      userId: u.id,
      version: u.version,
      expires: Date.now() + 8 * 3600000,
    });
    setCookie(res, "karen_staff", value, 8 * 3600000);
    res.json({
      user: { username: u.username, role: u.role },
      csrfToken: csrf(req),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/logout", (req, res) => {
  sessions.delete(digest(cookie(req, "karen_staff")));
  setCookie(res, "karen_staff", "", 0);
  sync();
  res.json({ ok: true });
});
app.get("/api/state", (req, res) => res.json(state(req)));
app.get("/api/table/:token", (req, res) => {
  const t = store.tables.find(
    (t) => t.active && t.qrToken === req.params.token,
  );
  if (!t)
    return res.status(404).json({
      error: "QR inválido o revocado. Solicita el QR actual al personal.",
    });
  const { qrToken, ...safe } = t;
  res.json(safe);
});
app.get("/api/orders/:id/receipt", permit("admin", "reception"), (req, res) => {
  const order = store.orders.find((o) => o.id === req.params.id);
  if (!order?.sinpeReceiptImage) return res.sendStatus(404);
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      order.sinpeReceiptImage,
    );
  if (!match) return res.sendStatus(404);
  res.type(match[1]).send(Buffer.from(match[2], "base64"));
});
app.get("/api/orders/:id", (req, res) => {
  const o = store.orders.find((o) => o.id === req.params.id);
  const u = staff(req);
  if (!o || (!u && (!owner(req) || o.ownerHash !== owner(req))))
    return res.status(404).json({ error: "Pedido no encontrado." });
  if (u?.role === "kitchen") {
    if (![OrderStatus.IN_KITCHEN, OrderStatus.READY].includes(o.status))
      return res.status(404).json({ error: "Pedido no encontrado." });
    return res.json(kitchenOrder(o));
  }
  res.json(u ? operationalOrder(o) : publicOrder(o));
});
app.post("/api/orders", (req, res) => {
  const b = req.body;
  const ownerHash = owner(req);
  if (!limit(`order:${req.socket.remoteAddress}`, 60, 60000))
    fail("Demasiados pedidos. Intenta más tarde.", 429);
  const requestKey = text(req.get("Idempotency-Key"), 100, true)!;
  if (!/^[\w-]{20,100}$/.test(requestKey))
    fail("Identificador de reintento inválido.");
  const requestHash = digest(JSON.stringify(b));
  const previous = store.orders.find(
    (o) => o.ownerHash === ownerHash && o.requestKey === requestKey,
  );
  if (previous) {
    if (previous.requestHash !== requestHash)
      fail("Este intento ya se usó para otro pedido.", 409);
    return res.json(publicOrder(previous));
  }
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100)
    fail("Agrega entre 1 y 100 líneas de productos.");
  const table = b.tableToken
    ? store.tables.find((t) => t.active && t.qrToken === b.tableToken)
    : undefined;
  if ((b.tableToken && !table) || (b.orderType === OrderType.DINE_IN && !table))
    fail("QR inválido o revocado.");
  const orderType = table ? OrderType.DINE_IN : OrderType.EXPRESS;
  const items = b.items.map((item: any) => {
    const product = store.menu.find(
      (p) => p.id === item.menuItemId && p.available,
    );
    if (!product) fail("Un platillo ya no está disponible.");
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99
    )
      fail("Cantidad inválida (1–99).");
    if (
      product.variants?.length
        ? !product.variants.includes(item.selectedVariant)
        : !!item.selectedVariant
    )
      fail("Selecciona una variante válida.");
    return {
      id: randomUUID(),
      menuItemId: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      selectedVariant: item.selectedVariant,
      notes: text(item.notes, 500),
    };
  });
  const subtotal = items.reduce(
    (sum: number, i: any) => sum + i.price * i.quantity,
    0,
  );
  const serviceFee = table ? Math.round(subtotal * 0.1) : 0;
  const deliveryFee = table ? 0 : store.settings.expressDeliveryFee;
  const customerName = text(b.customerName, 100, !table);
  const customerPhone = text(b.customerPhone, 30, !table);
  if (!table && !/^[+\d ()-]{8,30}$/.test(customerPhone!))
    fail("Teléfono inválido.");
  const deliveryAddress = table
    ? undefined
    : text(b.deliveryAddress, 800, true);
  if (
    !table &&
    ![PaymentMethod.SINPE, PaymentMethod.EFECTIVO].includes(b.paymentMethod)
  )
    fail("Método de pago inválido.");
  const receipt = text(b.sinpeReceiptImage, 1500000);
  if (
    receipt &&
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(receipt)
  )
    fail("Comprobante inválido.");
  if (!table && b.paymentMethod === PaymentMethod.SINPE && !receipt)
    fail("Adjunta el comprobante para revisión.");
  const cashChangeFor =
    b.cashChangeFor == null ? undefined : money(b.cashChangeFor);
  if (
    cashChangeFor != null &&
    cashChangeFor < subtotal + serviceFee + deliveryFee
  )
    fail("El monto para vuelto es menor al total.");
  const order: Order = {
    id: randomUUID(),
    orderNumber: store.nextOrderNumber,
    orderType,
    tableId: table?.id,
    tableName: table?.name,
    customerName,
    customerPhone,
    deliveryAddress,
    items,
    subtotal,
    serviceFee,
    deliveryFee,
    total: subtotal + serviceFee + deliveryFee,
    paymentMethod: table ? PaymentMethod.PENDING_CAJA : b.paymentMethod,
    sinpeReference: text(b.sinpeReference, 100),
    sinpeReceiptImage: receipt,
    cashChangeFor,
    isPaid: false,
    status: OrderStatus.PENDING_RECEPTION,
    createdAt: new Date().toISOString(),
    coverageStatus: table ? undefined : "pending",
    ownerHash,
    requestKey,
    requestHash,
    isTest: process.env.TEST_MODE === "true",
  };
  commit((s) => {
    s.nextOrderNumber++;
    s.orders.unshift(order);
  });
  res.status(201).json(publicOrder(order));
});
app.patch("/api/orders/:id", operations, (req, res) => {
  const user = staff(req)!;
  const b = req.body;
  const o = store.orders.find((o) => o.id === req.params.id);
  if (!o) fail("Pedido no encontrado.", 404);
  const allowed =
    user.role === "kitchen"
      ? ["status"]
      : [
          "status",
          "isPaid",
          "paymentMethod",
          "sinpeReference",
          "sinpeVerified",
          "coverageStatus",
        ];
  if (Object.keys(b).some((k) => !allowed.includes(k)))
    fail("Campo no autorizado.", 403);
  const updated = structuredClone(o);
  const now = new Date().toISOString();
  if (b.coverageStatus != null) {
    if (b.coverageStatus !== "verified" || o.orderType !== OrderType.EXPRESS)
      fail("Cobertura inválida.");
    updated.coverageStatus = "verified";
  }
  if (b.status && b.status !== o.status) {
    const transitions: Record<string, string[]> = {
      pending_reception: ["in_kitchen", "cancelled"],
      in_kitchen: ["ready", "cancelled"],
      ready: ["delivered", "cancelled"],
      delivered: [],
      cancelled: [],
    };
    if (
      !transitions[o.status]?.includes(b.status) ||
      (user.role === "kitchen" &&
        !(
          o.status === OrderStatus.IN_KITCHEN && b.status === OrderStatus.READY
        ))
    )
      fail("Transición de estado no permitida.", 409);
    if (b.status === OrderStatus.CANCELLED && o.isPaid)
      fail(
        "El pedido ya está cobrado; requiere conciliación antes de cancelar.",
        409,
      );
    if (
      b.status === OrderStatus.IN_KITCHEN &&
      o.orderType === OrderType.EXPRESS &&
      updated.coverageStatus !== "verified"
    )
      fail("Verifica la dirección y cobertura antes de aprobar.");
    updated.status = b.status;
    if (b.status === OrderStatus.IN_KITCHEN) updated.sentToKitchenAt = now;
    if (b.status === OrderStatus.READY) updated.readyAt = now;
    if (b.status === OrderStatus.DELIVERED) updated.deliveredAt = now;
  }
  if (b.isPaid != null && b.isPaid !== true)
    fail("No se puede deshacer un cobro desde este endpoint.");
  if (
    o.isPaid &&
    ((b.paymentMethod && b.paymentMethod !== o.paymentMethod) ||
      (b.sinpeReference && b.sinpeReference !== o.sinpeReference))
  )
    fail("El cobro ya está registrado.", 409);
  if (b.paymentMethod != null) {
    if (
      ![
        PaymentMethod.EFECTIVO,
        PaymentMethod.SINPE,
        PaymentMethod.TARJETA,
      ].includes(b.paymentMethod)
    )
      fail("Método inválido.");
    updated.paymentMethod = b.paymentMethod;
  }
  if (b.sinpeReference != null)
    updated.sinpeReference = text(b.sinpeReference, 100);
  if (b.isPaid && !o.isPaid) {
    if (
      updated.status === OrderStatus.CANCELLED ||
      updated.paymentMethod === PaymentMethod.PENDING_CAJA
    )
      fail("No se puede registrar el cobro.");
    if (
      updated.paymentMethod === PaymentMethod.SINPE &&
      b.sinpeVerified !== true
    )
      fail("Confirma la verificación del abono SINPE.");
    updated.isPaid = true;
    updated.paidAt = now;
    updated.paidBy = user.username;
  }
  commit((s) => {
    s.orders[s.orders.findIndex((x) => x.id === o.id)] = updated;
  });
  res.json(
    user.role === "kitchen" ? kitchenOrder(updated) : operationalOrder(updated),
  );
});
app.delete("/api/orders/:id", admin, (_req, _res) =>
  fail(
    "El historial se conserva. Cancela pedidos pendientes desde recepción.",
    409,
  ),
);
function validateMenu(item: any): MenuItem {
  if (
    !item ||
    !Object.values(CategoryId).includes(item.category) ||
    typeof item.available !== "boolean"
  )
    fail("Platillo inválido.");
  if (
    item.variants &&
    (!Array.isArray(item.variants) || item.variants.length > 30)
  )
    fail("Variantes inválidas.");
  return {
    id: text(item.id, 100, true)!,
    name: text(item.name, 150, true)!,
    category: item.category,
    price: money(item.price),
    available: item.available,
    description: text(item.description, 1000),
    scheduleText: text(item.scheduleText, 200),
    variants: item.variants?.map((v: any) => text(v, 100, true)!),
    featured: !!item.featured,
  };
}
app.post("/api/menu/item", admin, (req, res) => {
  const item = validateMenu(req.body);
  commit((s) => {
    const i = s.menu.findIndex((p) => p.id === item.id);
    if (i < 0) s.menu.push(item);
    else s.menu[i] = item;
  });
  res.json(item);
});
app.put("/api/menu", admin, (req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 1000)
    fail("Menú inválido.");
  const menu = req.body.map(validateMenu);
  if (new Set(menu.map((i) => i.id)).size !== menu.length)
    fail("Identificadores duplicados.");
  commit((s) => {
    s.menu = menu;
  });
  res.json(menu);
});
app.delete("/api/menu/item/:id", admin, (req, res) => {
  commit((s) => {
    s.menu = s.menu.filter((p) => p.id !== req.params.id);
  });
  res.json({ ok: true });
});
app.put("/api/tables", admin, (req, res) => {
  if (!Array.isArray(req.body) || req.body.length > 200)
    fail("Mesas inválidas.");
  const tables = req.body.map((t: any) => {
    if (
      !Number.isInteger(t.number) ||
      t.number < 1 ||
      !Number.isInteger(t.capacity) ||
      t.capacity < 1 ||
      t.capacity > 100 ||
      typeof t.active !== "boolean"
    )
      fail("Mesa inválida.");
    return {
      id: text(t.id, 100, true)!,
      name: text(t.name, 100, true)!,
      number: t.number,
      capacity: t.capacity,
      active: t.active,
      qrToken: store.tables.find((old) => old.id === t.id)?.qrToken || token(),
    };
  });
  if (
    new Set(tables.map((t) => t.id)).size !== tables.length ||
    new Set(tables.map((t) => t.number)).size !== tables.length
  )
    fail("Mesas duplicadas.");
  commit((s) => {
    s.tables = tables;
  });
  res.json(store.tables);
});
app.post("/api/tables/:id/rotate", admin, (req, res) => {
  if (!store.tables.some((t) => t.id === req.params.id))
    fail("Mesa no encontrada.", 404);
  commit((s) => {
    s.tables.find((t) => t.id === req.params.id)!.qrToken = token();
  });
  res.json(store.tables);
});
app.put("/api/settings", admin, (req, res) => {
  const next = { ...store.settings };
  const b = req.body;
  if (Object.keys(b).some((k) => !Object.hasOwn(next, k)))
    fail("Configuración inválida.");
  for (const [k, v] of Object.entries(b)) {
    if (k === "serviceChargePercent") {
      if (v !== 10) fail("El servicio de mesa debe ser 10%.");
      next[k] = 10;
    } else if (k === "expressDeliveryFee") next[k] = money(v);
    else if (k === "expressRadiusKm") {
      if (typeof v !== "number" || v <= 0 || v > 100) fail("Radio inválido.");
      next[k] = v;
    } else (next as any)[k] = text(v, 1000, true);
  }
  commit((s) => {
    s.settings = next;
  });
  res.json(next);
});
app.get("/api/users", admin, (_req, res) =>
  res.json(store.users.map(({ passwordHash, ...u }) => u)),
);
app.post("/api/users", admin, async (req, res, next) => {
  try {
    const b = req.body;
    const username = text(b.username, 80, true)!.toLowerCase();
    if (
      !/^[a-z0-9._-]{3,80}$/.test(username) ||
      !["admin", "reception", "kitchen"].includes(b.role)
    )
      fail("Usuario o rol inválido.");
    const passwordHash = b.password
      ? await hashPassword(b.password)
      : undefined;
    commit((s) => {
      const old = s.users.find((u) => u.username === username);
      if (!old && !passwordHash) fail("Indica una contraseña segura.");
      const u = {
        id: old?.id || randomUUID(),
        username,
        passwordHash: passwordHash || old!.passwordHash,
        role: b.role,
        active: b.active !== false,
        version: (old?.version || 0) + 1,
      };
      if (old) s.users[s.users.indexOf(old)] = u;
      else s.users.push(u);
      if (!s.users.some((u) => u.active && u.role === "admin"))
        fail("Debe quedar al menos un administrador activo.");
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Ruta no encontrada." }),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err.status || 500;
    if (status === 500) console.error("Operación fallida:", err.message);
    res.status(status).json({
      error:
        status === 500
          ? "No se pudo guardar la operación. Intenta nuevamente; no se confirmó ningún cambio."
          : err.message,
    });
  },
);
server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url || "/", "http://local").pathname !== "/ws") return;
  if (!sameOrigin(req) || !owner(req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.set(ws, req);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    ws.on("close", () => clients.delete(ws));
    ws.send(JSON.stringify({ type: "state:init", payload: state(req) }));
  });
});
// Periodic authoritative snapshots also remove expired/revoked staff privileges.
setInterval(() => {
  for (const ws of clients.keys()) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
  sync();
}, 15000).unref();
async function start() {
  if (production || process.env.SERVE_DIST === "true") {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "0.0.0.0",
    () => console.log(`Pollos Karen: puerto ${process.env.PORT || 3000}`),
  );
}
start().catch((e) => {
  console.error(e);
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    for (const ws of clients.keys()) ws.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
