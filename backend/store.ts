import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  INITIAL_MENU,
  INITIAL_SETTINGS,
  INITIAL_TABLES,
} from "../src/data/initialData.ts";
import type { AppStatePayload } from "../src/types.ts";
import { token, type Staff } from "./security.ts";
export interface Store extends AppStatePayload {
  nextOrderNumber: number;
  users: Staff[];
  csrfSecret: string;
  revision: number;
}
export const dataDir = path.resolve(process.env.DATA_DIR || ".data");
export const dataFile = path.join(dataDir, "karen-store.json");
export function writeStore(store: Store) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  const fd = fs.openSync(temporary, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(store, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, `${dataFile}.bak`);
  fs.renameSync(temporary, dataFile);
}
export function loadStore(): Store {
  fs.mkdirSync(dataDir, { recursive: true });
  // Invalid existing data must stop startup, never silently reset business data.
  const existing = fs.existsSync(dataFile);
  const store: Store = existing
    ? JSON.parse(fs.readFileSync(dataFile, "utf8"))
    : {
        menu: INITIAL_MENU,
        tables: INITIAL_TABLES,
        settings: INITIAL_SETTINGS,
        orders: [],
        nextOrderNumber: 1,
      };
  if (
    !Array.isArray(store.menu) ||
    !Array.isArray(store.tables) ||
    !Array.isArray(store.orders) ||
    !store.settings
  )
    throw new Error("Almacén inválido: restaurar desde una copia verificada.");
  if (existing)
    fs.copyFileSync(dataFile, `${dataFile}.pre-migration-${Date.now()}.bak`);
  store.settings.serviceChargePercent = 10;
  store.users ||= [];
  store.csrfSecret ||= token();
  store.revision ||= 0;
  store.nextOrderNumber = Math.max(
    store.nextOrderNumber || 1,
    ...store.orders.map((o) => o.orderNumber + 1),
    1,
  );
  store.tables = store.tables.map((t) => ({
    ...t,
    qrToken: t.qrToken || token(),
  }));
  store.orders = store.orders.map((o) => ({
    ...o,
    isTest: o.isTest || /^ord-demo-(100|101)$/.test(o.id),
  }));
  writeStore(store);
  return store;
}
export function acquireLock() {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "server.lock");
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, "utf8"));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (e: any) {
      if (e.code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        "El almacén ya está en uso. Solo se permite un proceso por DATA_DIR.",
      );
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file, String(process.pid), { flag: "wx", mode: 0o600 });
  return () => {
    if (
      fs.existsSync(file) &&
      fs.readFileSync(file, "utf8") === String(process.pid)
    )
      fs.unlinkSync(file);
  };
}
