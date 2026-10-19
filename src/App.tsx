import React, { useEffect, useRef, useState } from "react";
import { AppStatePayload, Order, OrderType, RestaurantTable } from "./types";
import { LOGO_URL } from "./data/initialData";
import { CustomerMenuView } from "./components/CustomerMenuView";
import { ReceptionView } from "./components/ReceptionView";
import { KitchenKDSView } from "./components/KitchenKDSView";
import { AdminPanelView } from "./components/AdminPanelView";
import { api } from "./utils/api";
import { playNotificationChime } from "./utils/format";
type User = { username: string; role: "admin" | "reception" | "kitchen" };
const route = window.location.pathname;
const desiredRole = (
  {
    "/admin": "admin",
    "/recepcion": "reception",
    "/cocina": "kitchen",
  } as const
)[route];
const internal = !!desiredRole;
const stateUrl = internal ? "/api/state" : "/api/state?scope=customer";
const tableToken = new URLSearchParams(window.location.search).get("qr");
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [qrReady, setQrReady] = useState(!tableToken);
  const [qrError, setQrError] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const ordersRef = useRef<Order[] | null>(null);
  const allowed = user && (user.role === "admin" || user.role === desiredRole);
  useEffect(() => {
    const reject = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setError(event.reason?.message || "No se pudo completar la operación.");
    };
    window.addEventListener("unhandledrejection", reject);
    api("/api/session")
      .then((s) => {
        sessionStorage.setItem("karen_csrf", s.csrfToken);
        setUser(s.user);
        setSessionReady(true);
      })
      .catch((e) => setError(e.message));
    if (tableToken)
      api(`/api/table/${encodeURIComponent(tableToken)}`)
        .then(setTable)
        .catch((e) => setQrError(e.message))
        .finally(() => setQrReady(true));
    return () => window.removeEventListener("unhandledrejection", reject);
  }, []);
  useEffect(() => {
    if (!sessionReady || (internal && !allowed)) return;
    let stopped = false;
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let retry = 0;
    let revision = -1;
    const apply = (data: AppStatePayload & { revision: number }) => {
      if (stopped || data.revision < revision) return;
      const old = ordersRef.current;
      if (
        internal &&
        old &&
        data.orders.some(
          (o) =>
            !old.some(
              (p) =>
                p.id === o.id && p.status === o.status && p.isPaid === o.isPaid,
            ),
        )
      ) {
        setToast("Pedidos actualizados.");
        if (soundRef.current)
          playNotificationChime(
            desiredRole === "kitchen" ? "kitchen" : "reception",
          );
      }
      revision = data.revision;
      ordersRef.current = data.orders;
      setState(data);
    };
    const connect = () => {
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws${internal ? "" : "?scope=customer"}`,
      );
      ws.onopen = () => {
        if (stopped) return;
        setConnected(true);
        retry = 0;
        api(stateUrl)
          .then(apply)
          .catch((e) => setError(e.message));
      };
      ws.onmessage = (event) => {
        try {
          apply(JSON.parse(event.data).payload);
        } catch {
          setError("Error de sincronización.");
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!stopped) {
          setConnected(false);
          timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
        }
      };
    };
    api(stateUrl)
      .then(apply)
      .catch((e) => setError(e.message));
    connect();
    const check = setInterval(() => {
      if (internal)
        api("/api/session")
          .then((s) => {
            if (!s.user || s.user.role !== user?.role) {
              setState(null);
              setUser(s.user);
            }
          })
          .catch(() => {});
    }, 15000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(check);
      ws?.close();
      ordersRef.current = null;
    };
  }, [sessionReady, user?.role, !!allowed]);
  async function refresh() {
    const next = await api<AppStatePayload>(stateUrl);
    setState((old) =>
      (old?.revision || 0) > (next.revision || 0) ? old : next,
    );
  }
  async function mutate(url: string, method: string, data?: unknown) {
    await api(url, method, data);
    await refresh();
  }
  async function submitOrder(payload: Partial<Order>) {
    const body = { ...payload, tableToken: tableToken || undefined };
    const serialized = JSON.stringify(body);
    let pending: { body: string; key: string } | null = null;
    try {
      pending = JSON.parse(
        sessionStorage.getItem("karen_pending_order") || "null",
      );
    } catch {}
    if (pending?.body !== serialized)
      pending = { body: serialized, key: crypto.randomUUID() };
    sessionStorage.setItem("karen_pending_order", JSON.stringify(pending));
    const created = await api<Order>("/api/orders", "POST", body, {
      "Idempotency-Key": pending!.key,
    });
    sessionStorage.removeItem("karen_pending_order");
    setState((s) =>
      s
        ? {
            ...s,
            orders: [created, ...s.orders.filter((o) => o.id !== created.id)],
          }
        : s,
    );
    return created;
  }
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <header className="no-print bg-white border-b p-4 flex flex-wrap gap-4 items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 text-[#C81E1E] font-bold text-xl"
        >
          <img
            src={LOGO_URL}
            className="w-10 h-10 rounded-full"
            alt="Pollos Karen"
          />
          Pollos Karen
        </a>
        {internal && allowed && (
          <nav className="flex gap-4 flex-wrap text-sm font-bold">
            {(user.role === "admin" || user.role === "reception") && (
              <a href="/recepcion">Recepción y Caja</a>
            )}
            {(user.role === "admin" || user.role === "kitchen") && (
              <a href="/cocina">Cocina KDS</a>
            )}
            {user.role === "admin" && <a href="/admin">Administración</a>}
            <button
              onClick={() => {
                soundRef.current = !sound;
                setSound(!sound);
                if (!sound) playNotificationChime();
              }}
            >
              {sound ? "Silenciar" : "Activar sonido"}
            </button>
            <button
              onClick={async () => {
                await api("/api/logout", "POST", {});
                setState(null);
                setUser(null);
              }}
            >
              Cerrar sesión
            </button>
          </nav>
        )}
        <span
          role="status"
          className={`text-xs ${connected ? "text-green-700" : "text-amber-800"}`}
        >
          {connected ? "Conectado" : "Sin conexión en vivo · reconectando"}
        </span>
      </header>
      {error && (
        <div role="alert" className="p-4 bg-red-100 text-red-900">
          {error} <button onClick={() => setError("")}>Cerrar</button>
        </div>
      )}
      {toast && (
        <div role="status" className="p-3 bg-emerald-100">
          {toast} <button onClick={() => setToast("")}>OK</button>
        </div>
      )}
      {!sessionReady ? (
        <p className="p-6">Conectando con el restaurante…</p>
      ) : internal && !user ? (
        <Login onLogin={setUser} />
      ) : internal && !allowed ? (
        <div className="p-6">
          Tu cuenta no tiene acceso a este módulo.{" "}
          <button
            onClick={async () => {
              await api("/api/logout", "POST", {});
              setUser(null);
            }}
          >
            Cambiar cuenta
          </button>
        </div>
      ) : !qrReady || !state ? (
        <p className="p-6">Cargando…</p>
      ) : qrError && !internal ? (
        <div role="alert" className="p-6">
          {qrError} <a href="/">Ir al menú exprés</a>
        </div>
      ) : (
        <main className="flex-1">
          {!internal && (
            <CustomerMenuView
              menu={state.menu}
              tables={table ? [table] : []}
              settings={state.settings}
              orders={state.orders}
              selectedTableId={table?.id || null}
              initialMode={table ? OrderType.DINE_IN : OrderType.EXPRESS}
              onSubmitOrder={submitOrder}
            />
          )}
          {desiredRole === "reception" && (
            <ReceptionView
              orders={state.orders}
              settings={state.settings}
              onUpdateOrder={(id, b) => mutate(`/api/orders/${id}`, "PATCH", b)}
            />
          )}
          {desiredRole === "kitchen" && (
            <KitchenKDSView
              orders={state.orders}
              onUpdateOrder={(id, b) => mutate(`/api/orders/${id}`, "PATCH", b)}
            />
          )}
          {desiredRole === "admin" && (
            <AdminPanelView
              menu={state.menu}
              tables={state.tables}
              orders={state.orders}
              settings={state.settings}
              onSaveMenuItem={(b) => mutate("/api/menu/item", "POST", b)}
              onDeleteMenuItem={(id) =>
                mutate(`/api/menu/item/${id}`, "DELETE")
              }
              onSaveTables={(b) => mutate("/api/tables", "PUT", b)}
              onSaveSettings={(b) => mutate("/api/settings", "PUT", b)}
              onSimulateScanTable={(id) => {
                const t = state.tables.find((t) => t.id === id);
                location.href = `/?qr=${encodeURIComponent(t?.qrToken || "")}`;
              }}
              onSimulateExpress={() => {
                location.href = "/";
              }}
            />
          )}
        </main>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="bg-white rounded-2xl border p-6 m-6 mx-auto w-[calc(100%-3rem)] max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          const s = await api("/api/login", "POST", {
            username: form.get("username"),
            password: form.get("password"),
          });
          onLogin(s.user);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-2xl font-bold text-[#C81E1E]">Acceso del personal</h1>
      <label className="block">
        Usuario
        <input
          name="username"
          autoComplete="username"
          required
          className="block border p-2 rounded w-full"
        />
      </label>
      <label className="block">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="block border p-2 rounded w-full"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="bg-[#C81E1E] text-white rounded px-5 py-2"
      >
        {busy ? "Verificando…" : "Ingresar"}
      </button>
    </form>
  );
}
