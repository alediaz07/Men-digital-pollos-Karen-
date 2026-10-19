import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
type Staff = { username: string; role: string; active: boolean };
export function StaffAccounts() {
  const [users, setUsers] = useState<Staff[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Staff>({
    username: "",
    role: "reception",
    active: true,
  });
  const load = () =>
    api("/api/users")
      .then(setUsers)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="no-print rounded-2xl border bg-white p-5 space-y-4">
      <h2 className="font-bold text-lg">Cuentas y permisos del personal</h2>
      <p className="text-xs">
        Cambiar permisos o contraseña cierra las sesiones existentes de esa
        cuenta.
      </p>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <button
            className="border rounded p-2 text-sm"
            key={u.username}
            onClick={() => setEditing(u)}
          >
            {u.username} · {u.role} · {u.active ? "Activo" : "Inactivo"}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-3 items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setBusy(true);
          setError("");
          try {
            await api("/api/users", "POST", {
              ...editing,
              password: fd.get("password") || undefined,
            });
            await load();
            form.reset();
            setEditing({ username: "", role: "reception", active: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-sm">
          Usuario
          <input
            value={editing.username}
            pattern="[a-z0-9._-]{3,80}"
            required
            onChange={(e) =>
              setEditing({ ...editing, username: e.target.value })
            }
            className="block border p-2 rounded"
          />
        </label>
        <label className="text-sm">
          Rol
          <select
            value={editing.role}
            onChange={(e) => setEditing({ ...editing, role: e.target.value })}
            className="block border p-2 rounded"
          >
            <option value="admin">Administrador</option>
            <option value="reception">Recepción / Caja</option>
            <option value="kitchen">Cocina</option>
          </select>
        </label>
        <label className="text-sm">
          Contraseña nueva
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder="12 caracteres mínimo"
            className="block border p-2 rounded"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={editing.active}
            onChange={(e) =>
              setEditing({ ...editing, active: e.target.checked })
            }
          />{" "}
          Activo
        </label>
        <button disabled={busy} className="bg-[#C81E1E] text-white rounded p-2">
          Guardar cuenta
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
