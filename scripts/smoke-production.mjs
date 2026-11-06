#!/usr/bin/env node
// Read-only production smoke checks. Never creates orders or logs in.
const origin = process.argv[2];
if (!origin || !/^https:\/\/[^/]+\/?$/.test(origin)) {
  console.error("Uso: node scripts/smoke-production.mjs https://dominio-del-restaurante");
  process.exit(2);
}
const base = origin.replace(/\/$/, "");
let failed = false;
async function check(label, path, validate) {
  try {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = null; }
    const ok = validate(response, body);
    console.log(`${ok ? "OK" : "ERROR"} | ${label} | HTTP ${response.status}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`ERROR | ${label} | ${error.message}`);
  }
}
await check("Sesión pública sin personal autenticado", "/api/session", (r, b) =>
  r.ok && b && b.user === null && typeof b.csrfToken === "string");
await check("Catálogo público", "/api/state?scope=customer", (r, b) =>
  r.ok && b && Array.isArray(b.menu) && Array.isArray(b.orders) && b.orders.length === 0);
await check("Horario exprés", "/api/express/status", (r, b) =>
  r.ok && b && typeof b.open === "boolean");
await check("QR inválido rechazado", "/api/table/invalid-smoke-check-token", (r) =>
  r.status === 404);
process.exitCode = failed ? 1 : 0;
