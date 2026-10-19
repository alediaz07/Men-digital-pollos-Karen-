import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hashPassword } from "../backend/security.ts";
import {
  INITIAL_MENU,
  INITIAL_SETTINGS,
  INITIAL_TABLES,
} from "../src/data/initialData.ts";
test(
  "Navegador: móvil, QR, recepción, KDS, cobro, historial y acceso privado",
  { timeout: 120000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karen-browser-"));
    const port = String(46000 + Math.floor(Math.random() * 1000)),
      origin = `http://127.0.0.1:${port}`;
    const passwordHash = await hashPassword("Browser-isolated-test!");
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
    const server = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
      env: {
        ...process.env,
        DATA_DIR: dir,
        PORT: port,
        HOST: "127.0.0.1",
        SERVE_DIST: "true",
        TEST_MODE: "true",
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    server.stdout!.on("data", (d) => (log += d));
    server.stderr!.on("data", (d) => (log += d));
    const browser = await chromium.launch();
    const errors: string[] = [];
    const page = async (width = 1280, height = 900) => {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("dialog", (d) => d.accept());
      return p;
    };
    const login = async (p: Page, route: string, role: string) => {
      await p.goto(origin + route);
      await p.getByLabel("Usuario", { exact: true }).fill(role);
      await p
        .getByLabel("Contraseña", { exact: true })
        .fill("Browser-isolated-test!");
      await p.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(
        p.getByRole("button", { name: "Cerrar sesión" }),
      ).toBeVisible();
    };
    const addChicken = async (p: Page) => {
      await p
        .getByPlaceholder("Buscar casado, pinto, alitas...")
        .fill("POLLO FRITO");
      await p.getByRole("button", { name: "Agregar", exact: true }).click();
      await p.getByRole("button", { name: "Agregar al pedido" }).click();
      await p.getByRole("button", { name: /Ver pedido/ }).click();
    };
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(origin + "/api/session")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      const publicPage = await page(390, 844);
      await publicPage.goto(origin + "/");
      await expect(
        publicPage.getByText("Servicio Exprés", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        publicPage.getByRole("link", { name: "Administración", exact: true }),
      ).toHaveCount(0);
      await expect(publicPage.getByRole("combobox")).toHaveCount(0);
      assert.ok(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "El menú no debe desbordar en móvil",
      );
      fs.mkdirSync(".tools/screenshots", { recursive: true });
      await publicPage.screenshot({
        path: ".tools/screenshots/menu-mobile.png",
        fullPage: true,
      });
      const adm = await page();
      await login(adm, "/admin", "admin");
      await expect(
        adm.getByAltText("QR Mesa 3", { exact: true }),
      ).toBeVisible();
      const token = await adm.evaluate(async () => {
        const s = await fetch("/api/state").then((r) => r.json());
        return s.tables.find((t: any) => t.number === 3).qrToken;
      });
      const customer = await page(390, 844);
      await customer.goto(origin + "/?qr=" + token);
      await expect(
        customer.getByText("Mesa 3", { exact: true }).first(),
      ).toBeVisible();
      await addChicken(customer);
      await expect(
        customer.getByRole("button", {
          name: "Enviar Pedido de Mesa 3 (₡3.300)",
          exact: true,
        }),
      ).toBeVisible();
      await customer.screenshot({
        path: ".tools/screenshots/checkout-table.png",
        fullPage: true,
      });
      const rec = await page();
      await login(rec, "/recepcion", "reception");
      const kds = await page(1024, 768);
      await login(kds, "/cocina", "kitchen");
      await customer
        .getByRole("button", {
          name: "Enviar Pedido de Mesa 3 (₡3.300)",
          exact: true,
        })
        .click();
      await expect(
        rec.getByRole("button", { name: "Enviar a Cocina", exact: true }),
      ).toBeVisible();
      await rec
        .getByRole("button", { name: "Enviar a Cocina", exact: true })
        .click();
      await expect(
        kds.getByRole("button", {
          name: "¡Pedido Listo para Entregar!",
          exact: true,
        }),
      ).toBeVisible();
      await kds.screenshot({
        path: ".tools/screenshots/kitchen.png",
        fullPage: true,
      });
      await kds
        .getByRole("button", {
          name: "¡Pedido Listo para Entregar!",
          exact: true,
        })
        .click();
      await rec.getByRole("button", { name: /En Cocina y Caja/ }).click();
      await expect(
        rec.getByRole("button", { name: "Marcar Entregado", exact: true }),
      ).toBeVisible();
      await rec
        .getByRole("button", { name: "Cobrar en Caja", exact: true })
        .click();
      await rec
        .getByRole("button", { name: "Registrar Pago (₡3.300)", exact: true })
        .click();
      await rec
        .getByRole("button", { name: "Marcar Entregado", exact: true })
        .click();
      await expect(
        customer.getByText("Pedido entregado", { exact: true }),
      ).toBeVisible();
      await addChicken(publicPage);
      await publicPage.getByPlaceholder("Tu nombre").fill("Prueba móvil");
      await publicPage.getByPlaceholder("Ej. 8888-8888").fill("8888-8888");
      await publicPage
        .getByPlaceholder(
          "Color de casa, portón, punto de referencia cercano...",
        )
        .fill("Dirección de prueba aislada");
      await publicPage.getByRole("button", { name: /Efectivo/ }).click();
      await expect(
        publicPage.getByRole("button", {
          name: "Confirmar Pedido Exprés (₡3.500)",
          exact: true,
        }),
      ).toBeVisible();
      await publicPage
        .getByRole("button", {
          name: "Confirmar Pedido Exprés (₡3.500)",
          exact: true,
        })
        .click();
      await expect(
        publicPage.getByText("Seguimiento de tu pedido en vivo"),
      ).toBeVisible();
      const restricted = await page();
      await restricted.goto(origin + "/admin");
      await expect(
        restricted.getByRole("heading", { name: "Acceso del personal" }),
      ).toBeVisible();
      await expect(
        restricted.getByText("Panel Administrativo", { exact: false }),
      ).toHaveCount(0);
      await adm.getByRole("button", { name: /Ventas/ }).click();
      await expect(
        adm.getByText("Ventas cobradas", { exact: true }),
      ).toBeVisible();
      await adm.screenshot({
        path: ".tools/screenshots/admin-sales.png",
        fullPage: true,
      });
      for (const width of [375, 768, 1280]) {
        await publicPage.setViewportSize({ width, height: 900 });
        assert.ok(
          await publicPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Sin desborde en ${width}px`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (e) {
      console.error(log);
      for (const ctx of browser.contexts())
        for (const p of ctx.pages())
          console.error(
            p.url(),
            (await p.locator("body").innerText()).slice(0, 3500),
          );
      throw e;
    } finally {
      await browser.close();
      server.kill();
      await once(server, "exit");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
