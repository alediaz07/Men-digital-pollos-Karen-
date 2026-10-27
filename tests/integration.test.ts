import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import {
  INITIAL_MENU,
  INITIAL_SETTINGS,
  INITIAL_TABLES,
} from "../src/data/initialData.ts";
import { hashPassword } from "../backend/security.ts";
import { sales, dateRange, costaRicaDate } from "../src/utils/sales.ts";
import type { Order } from "../src/types.ts";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karen-tests-"));
const port = String(32000 + Math.floor(Math.random() * 15000));
const origin = `http://127.0.0.1:${port}`;
let child: ChildProcess;
let output = "";
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: {
      ...process.env,
      PORT: port,
      HOST: "127.0.0.1",
      DATA_DIR: dir,
      SERVE_DIST: "true",
      NODE_ENV: "test",
      TEST_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (d) => (output += d));
  child.stderr!.on("data", (d) => (output += d));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const r = await fetch(origin + "/api/session");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Servidor no arrancó: " + output);
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
class Client {
  cookies = new Map<string, string>();
  csrf = "";
  async req(
    url: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const r = await fetch(origin + url, {
      method,
      headers: {
        Origin: origin,
        Cookie: this.cookie(),
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrf,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) {
      const pair = c.split(";")[0],
        i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const data = await r.json();
    if (url === "/api/session") this.csrf = data.csrfToken;
    return { status: r.status, data, headers: r.headers };
  }
  cookie() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async init(role?: string) {
    await this.req("/api/session");
    if (role) {
      const r = await this.req("/api/login", "POST", {
        username: role,
        password: "A-secure-test-password!",
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
    }
    return this;
  }
}
const admin = new Client(),
  reception = new Client(),
  kitchen = new Client(),
  alice = new Client(),
  bob = new Client();
const item = {
  menuItemId: "cas-pollo-frito",
  quantity: 1,
  price: 1,
  name: "Falsificado",
};
const express = {
  items: [item],
  orderType: "express",
  customerName: "Prueba aislada",
  customerPhone: "8888-8888",
  deliveryAddress: "Dirección de prueba",
  paymentMethod: "efectivo",
};
let tableToken: string, tableOrder: Order, expressOrder: Order;
const sockets: WebSocket[] = [];
function socket(c: Client) {
  const ws = new WebSocket(origin.replace("http", "ws") + "/ws", {
    headers: { Origin: origin, Cookie: c.cookie() },
  });
  sockets.push(ws);
  return ws;
}
function waitState(ws: WebSocket, predicate: (s: any) => boolean) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", read);
      reject(new Error("Evento WS no recibido"));
    }, 5000);
    const read = (raw: any) => {
      const s = JSON.parse(raw.toString()).payload;
      if (predicate(s)) {
        clearTimeout(timer);
        ws.off("message", read);
        resolve(s);
      }
    };
    ws.on("message", read);
  });
}
before(async () => {
  const passwordHash = await hashPassword("A-secure-test-password!");
  fs.writeFileSync(
    path.join(dir, "karen-store.json"),
    JSON.stringify({
      menu: INITIAL_MENU,
      tables: INITIAL_TABLES,
      settings: INITIAL_SETTINGS,
      orders: [],
      nextOrderNumber: 1,
      users: ["admin", "reception", "kitchen"].map((role) => ({
        id: role,
        username: role,
        role,
        passwordHash,
        active: true,
        version: 1,
      })),
    }),
  );
  await start();
  await admin.init("admin");
  await reception.init("reception");
  await kitchen.init("kitchen");
  await alice.init();
  await bob.init();
});
after(async () => {
  sockets.forEach((ws) => ws.terminate());
  await stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("A/B: QR de Mesa 3, 10% exacto, exprés sin servicio y precios calculados por servidor", async () => {
  const state = await admin.req("/api/state");
  tableToken = state.data.tables.find((t: any) => t.number === 3).qrToken;
  const table = await alice.req("/api/table/" + tableToken);
  assert.equal(table.data.name, "Mesa 3");
  assert.equal(table.data.qrToken, undefined);
  const r = await alice.req(
    "/api/orders",
    "POST",
    { items: [item], orderType: "dine_in", tableToken, isPaid: true, total: 1 },
    { "Idempotency-Key": "table-test-00000000000001" },
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  tableOrder = r.data;
  assert.equal(r.data.subtotal, 3000);
  assert.equal(r.data.serviceFee, 300);
  assert.equal(r.data.total, 3300);
  assert.equal(r.data.tableId, "mesa-3");
  assert.equal(r.data.isPaid, false);
  assert.equal(r.data.items[0].name, "POLLO FRITO");
  const e = await alice.req("/api/orders", "POST", express, {
    "Idempotency-Key": "express-test-000000000001",
  });
  assert.equal(e.status, 201);
  expressOrder = e.data;
  assert.equal(e.data.serviceFee, 0);
  assert.equal(e.data.deliveryFee, 500);
  assert.equal(e.data.total, 3500);
  assert.equal(e.data.tableId, undefined);
  assert.equal(e.data.coverageStatus, "pending");
  const bad = await bob.req(
    "/api/orders",
    "POST",
    { items: [item], orderType: "dine_in", tableId: "mesa-1" },
    { "Idempotency-Key": "forged-test-0000000000001" },
  );
  assert.equal(bad.status, 400);
});
test("Privacidad HTTP: clientes separados y cocina sin datos financieros ni personales", async () => {
  const a = await alice.req("/api/state"),
    b = await bob.req("/api/state");
  assert.equal(a.data.orders.length, 2);
  assert.equal(b.data.orders.length, 0);
  assert.deepEqual(b.data.tables, []);
  assert.equal((await bob.req("/api/orders/" + tableOrder.id)).status, 404);
  assert.equal(JSON.stringify(a.data).includes("ownerHash"), false);
  assert.equal((await kitchen.req("/api/state")).data.orders.length, 0);
});
test("C/D: recepción → cocina → listo → entrega con eventos privados", async () => {
  const kr = socket(kitchen),
    rr = socket(reception),
    ar = socket(alice),
    br = socket(bob);
  await Promise.all([kr, rr, ar, br].map((ws) => once(ws, "open")));
  const kEvent = waitState(kr, (s) =>
    s.orders.some((o: any) => o.id === tableOrder.id),
  );
  const approved = await reception.req(
    "/api/orders/" + tableOrder.id,
    "PATCH",
    { status: "in_kitchen" },
  );
  assert.equal(approved.status, 200);
  const ks = await kEvent;
  assert.equal(ks.orders[0].customerPhone, undefined);
  assert.equal(ks.orders[0].total, undefined);
  assert.equal(ks.orders[0].items[0].price, undefined);
  const rEvent = waitState(rr, (s) =>
    s.orders.some((o: any) => o.id === tableOrder.id && o.status === "ready"),
  );
  const aEvent = waitState(ar, (s) =>
    s.orders.some((o: any) => o.id === tableOrder.id && o.status === "ready"),
  );
  const bEvent = waitState(br, (s) => s.orders.length === 0);
  assert.equal(
    (
      await kitchen.req("/api/orders/" + tableOrder.id, "PATCH", {
        status: "ready",
      })
    ).status,
    200,
  );
  await Promise.all([rEvent, aEvent, bEvent]);
  assert.equal(
    (
      await reception.req("/api/orders/" + tableOrder.id, "PATCH", {
        status: "delivered",
      })
    ).status,
    200,
  );
  const reconnect = socket(alice);
  const snapshot = await waitState(reconnect, (s) =>
    s.orders.some((o: any) => o.status === "delivered"),
  );
  assert.equal(snapshot.orders.length, 2);
});
test("E: cobro idempotente, SINPE exige verificación y no confunde captura con pago", async () => {
  const p = await reception.req("/api/orders/" + tableOrder.id, "PATCH", {
    isPaid: true,
    paymentMethod: "sinpe",
  });
  assert.equal(p.status, 400);
  const paid = await reception.req("/api/orders/" + tableOrder.id, "PATCH", {
    isPaid: true,
    paymentMethod: "sinpe",
    sinpeVerified: true,
    sinpeReference: "BANK-TEST-001",
  });
  assert.equal(paid.status, 200);
  assert.ok(paid.data.paidAt);
  const again = await reception.req("/api/orders/" + tableOrder.id, "PATCH", {
    isPaid: true,
    paymentMethod: "sinpe",
    sinpeVerified: true,
  });
  assert.equal(again.data.paidAt, paid.data.paidAt);
  assert.equal(
    (
      await reception.req("/api/orders/" + tableOrder.id, "PATCH", {
        paymentMethod: "efectivo",
      })
    ).status,
    409,
  );
});
test("F: roles, CSRF y transiciones impiden modificaciones directas", async () => {
  assert.equal(
    (await bob.req("/api/menu/item", "POST", INITIAL_MENU[0])).status,
    401,
  );
  assert.equal(
    (await kitchen.req("/api/menu/item", "POST", INITIAL_MENU[0])).status,
    403,
  );
  assert.equal(
    (await bob.req("/api/orders/" + expressOrder.id, "PATCH", { isPaid: true }))
      .status,
    401,
  );
  assert.equal(
    (
      await reception.req("/api/orders/" + expressOrder.id, "PATCH", {
        status: "delivered",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await kitchen.req("/api/orders/" + expressOrder.id, "PATCH", {
        status: "in_kitchen",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await reception.req("/api/orders/" + expressOrder.id, "PATCH", {
        total: 1,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.req(
        "/api/settings",
        "PUT",
        { expressDeliveryFee: 1 },
        { "X-CSRF-Token": "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.req(
        "/api/settings",
        "PUT",
        { expressDeliveryFee: 1 },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await reception.req("/api/orders/" + expressOrder.id, "PATCH", {
        status: "in_kitchen",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await reception.req("/api/orders/" + expressOrder.id, "PATCH", {
        coverageStatus: "verified",
        status: "in_kitchen",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await kitchen.req("/api/orders/" + expressOrder.id, "PATCH", {
        isPaid: true,
      })
    ).status,
    403,
  );
});
test("Reintentos no duplican pedidos ni alteran consecutivos; cantidades y variantes inválidas", async () => {
  const r = await alice.req("/api/orders", "POST", express, {
    "Idempotency-Key": "express-test-000000000001",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.id, expressOrder.id);
  assert.equal(
    (
      await alice.req(
        "/api/orders",
        "POST",
        { ...express, customerName: "Otro" },
        { "Idempotency-Key": "express-test-000000000001" },
      )
    ).status,
    409,
  );
  for (const quantity of [-1, 0, 1.5, 100])
    assert.equal(
      (
        await alice.req(
          "/api/orders",
          "POST",
          { ...express, items: [{ ...item, quantity }] },
          {
            "Idempotency-Key": `bad-quantity-${String(quantity).padStart(20, "0")}`,
          },
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await alice.req(
        "/api/orders",
        "POST",
        {
          ...express,
          items: [
            {
              menuItemId: "ref-jugo",
              quantity: 1,
              selectedVariant: "inventado",
            },
          ],
        },
        { "Idempotency-Key": "bad-variant-0000000000001" },
      )
    ).status,
    400,
  );
  assert.equal((await admin.req("/api/state")).data.orders.length, 2);
});
test("QR revocado deja de validar; catálogo/configuración persisten tras reinicio", async () => {
  const rotated = await admin.req("/api/tables/mesa-3/rotate", "POST", {});
  assert.equal(rotated.status, 200);
  assert.notEqual(
    rotated.data.find((t: any) => t.id === "mesa-3").qrToken,
    tableToken,
  );
  assert.equal((await alice.req("/api/table/" + tableToken)).status, 404);
  assert.equal(
    (await admin.req("/api/settings", "PUT", { expressDeliveryFee: 700 }))
      .status,
    200,
  );
  assert.equal(
    (
      await admin.req("/api/menu/item", "POST", {
        ...INITIAL_MENU[0],
        price: 2600,
      })
    ).status,
    200,
  );
  sockets.forEach((ws) => ws.terminate());
  await stop();
  await start();
  assert.equal((await admin.req("/api/users")).status, 401);
  await admin.init("admin");
  const s = await admin.req("/api/state");
  assert.equal(s.data.orders.length, 2);
  assert.equal(
    s.data.orders.find((o: any) => o.id === tableOrder.id).isPaid,
    true,
  );
  assert.equal(s.data.settings.expressDeliveryFee, 700);
  assert.equal(s.data.menu[0].price, 2600);
  assert.equal((await alice.req("/api/state")).data.orders.length, 2);
});
test("Métricas excluyen pruebas, impagos y cancelados; zona horaria CR y fecha de cobro", () => {
  const base = {
    ...tableOrder,
    isTest: false,
    createdAt: "2026-10-19T05:30:00Z",
    paidAt: "2026-10-19T06:30:00Z",
    isPaid: true,
  } as Order;
  const result = sales(
    [
      base,
      { ...base, isPaid: false },
      { ...base, isTest: true },
      { ...base, id: "ord-demo-101" },
      { ...base, status: "cancelled" as any },
    ],
    "2026-10-19",
    "2026-10-19",
  );
  assert.equal(result.totalRevenue, 3300);
  assert.equal(result.paidCount, 1);
  assert.equal(costaRicaDate(base.createdAt), "2026-10-18");
  assert.equal(result.totalOrders, 0);
  assert.deepEqual(
    dateRange("week", "", "", new Date("2026-10-19T12:00:00Z")),
    ["2026-10-13", "2026-10-19"],
  );
});
test("Fallos de escritura no confirman cambios ni alteran el estado operativo", async () => {
  const before = await admin.req("/api/state");
  const backup = path.join(dir, "karen-store.json.bak");
  fs.unlinkSync(backup);
  fs.mkdirSync(backup);
  try {
    const failed = await admin.req("/api/settings", "PUT", {
      expressDeliveryFee: 999,
    });
    assert.equal(failed.status, 500);
    const after = await admin.req("/api/state");
    assert.equal(
      after.data.settings.expressDeliveryFee,
      before.data.settings.expressDeliveryFee,
    );
    assert.equal(after.data.revision, before.data.revision);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "karen-store.json"), "utf8"))
        .settings.expressDeliveryFee,
      700,
    );
  } finally {
    fs.rmdirSync(backup);
  }
});
test("Comprobantes privados, acceso público explícito y WebSocket rechaza otro origen", async () => {
  await kitchen.init("kitchen");
  const r = await alice.req(
    "/api/orders",
    "POST",
    {
      ...express,
      paymentMethod: "sinpe",
      sinpeReceiptImage: "data:image/png;base64,iVBORw0KGgo=",
    },
    { "Idempotency-Key": "receipt-test-000000000001" },
  );
  assert.equal(r.status, 201);
  assert.equal(r.data.isPaid, false);
  assert.equal(r.data.sinpeReceiptImage, undefined);
  const staffOrder = await admin.req("/api/orders/" + r.data.id);
  assert.equal(
    staffOrder.data.sinpeReceiptImage,
    "/api/orders/" + r.data.id + "/receipt",
  );
  const image = await fetch(origin + staffOrder.data.sinpeReceiptImage, {
    headers: { Cookie: admin.cookie() },
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal((await bob.req(staffOrder.data.sinpeReceiptImage)).status, 401);
  assert.equal(
    (await kitchen.req(staffOrder.data.sinpeReceiptImage)).status,
    403,
  );
  assert.equal(
    (await admin.req("/api/state?scope=customer")).data.orders.length,
    0,
  );
  const ws = new WebSocket(origin.replace("http", "ws") + "/ws", {
    headers: { Origin: "https://evil.example", Cookie: alice.cookie() },
  });
  await new Promise<void>((resolve, reject) => {
    ws.on("unexpected-response", (_req, res) => {
      assert.equal(res.statusCode, 403);
      res.resume();
      ws.terminate();
      resolve();
    });
    ws.on("open", () => reject(new Error("Origen externo aceptado")));
    ws.on("error", () => {});
  });
});
test("Inventario: recetas, descuento único al aprobar y bloqueo por falta de insumos", async () => {
  const created = await admin.req("/api/admin/inventory/ingredient", "POST", {
    name: "Pollo de prueba", unit: "g", quantity: 400, minimum: 50,
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const ingredientId = created.data.ingredient.id;
  const recipe = await admin.req("/api/admin/inventory/recipe/cas-pollo-frito", "PUT", {
    parts: [{ ingredientId, quantity: 200 }],
  });
  assert.equal(recipe.status, 200, JSON.stringify(recipe.data));
  const first = await bob.req("/api/orders", "POST", {items:[item], tableToken}, {
    "Idempotency-Key": "inventory-test-0000000001",
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const approve = await reception.req("/api/orders/" + first.data.id, "PATCH", {status:"in_kitchen"});
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  let snapshot = await admin.req("/api/admin/inventory");
  assert.equal(snapshot.data.ingredients.find((x:any)=>x.id===ingredientId).quantity, 200);
  const second = await bob.req("/api/orders", "POST", {items:[{...item,quantity:2}],tableToken}, {
    "Idempotency-Key": "inventory-test-0000000002",
  });
  assert.equal(second.status, 201);
  const rejected = await reception.req("/api/orders/" + second.data.id, "PATCH", {status:"in_kitchen"});
  assert.equal(rejected.status, 409);
  snapshot = await admin.req("/api/admin/inventory");
  assert.equal(snapshot.data.ingredients.find((x:any)=>x.id===ingredientId).quantity, 200);
  assert.equal(snapshot.data.movements.filter((x:any)=>x.orderId===first.data.id).length, 1);
});
test("Limitación de login y cierre de sesión", async () => {
  const c = await new Client().init();
  let r;
  for (let i = 0; i < 9; i++)
    r = await c.req("/api/login", "POST", {
      username: "nobody",
      password: "wrong-password",
    });
  assert.equal(r!.status, 429);
  assert.equal((await admin.req("/api/logout", "POST", {})).status, 200);
  assert.equal((await admin.req("/api/users")).status, 401);
});

test("Consecutivos únicos ante solicitudes simultáneas", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      bob.req("/api/orders", "POST", express, {
        "Idempotency-Key": "concurrent-request-00000000" + i,
      }),
    ),
  );
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(new Set(results.map((r) => r.data.orderNumber)).size, 8);
  assert.equal(new Set(results.map((r) => r.data.id)).size, 8);
});
test("Almacén nuevo vacío y archivo corrupto no se reemplaza", () => {
  const isolated = path.join(dir, "empty-store");
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        'import("./backend/store.ts").then(m => m.loadStore())',
      ],
      { env: { ...process.env, DATA_DIR: isolated }, encoding: "utf8" },
    );
  assert.equal(run().status, 0);
  const file = path.join(isolated, "karen-store.json");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).orders.length, 0);
  fs.writeFileSync(file, "INVALID-STORE");
  assert.notEqual(run().status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), "INVALID-STORE");
});
