import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { acquireLock, loadStore, writeStore } from "../backend/store.ts";
import { hashPassword, type Role } from "../backend/security.ts";
const [username, role] = process.argv.slice(2);
if (
  !/^[a-z0-9._-]{3,80}$/.test(username || "") ||
  !["admin", "reception", "kitchen"].includes(role)
)
  throw new Error("Uso: npm run setup-user -- usuario admin|reception|kitchen");
const unlock = acquireLock();
try {
  let password = "";
  if (process.stdin.isTTY) {
    process.stdout.write("Contraseña (mínimo 12 caracteres): ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    password = await new Promise<string>((resolve, reject) => {
      const listener = (data: string) => {
        for (const char of data) {
          if (char === "\u0003") {
            process.stdin.off("data", listener);
            reject(new Error("Cancelado"));
            return;
          }
          if (char === "\r" || char === "\n") {
            process.stdin.off("data", listener);
            resolve(password);
            return;
          }
          if (char === "\u007f" || char === "\b")
            password = password.slice(0, -1);
          else password += char;
        }
      };
      process.stdin.on("data", listener);
    });
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\n");
  } else {
    const reader = createInterface({ input: process.stdin });
    for await (const line of reader) {
      password = line;
      reader.close();
      break;
    }
  }
  const store = loadStore();
  if (store.users.some((u) => u.username === username))
    throw new Error(
      "El usuario ya existe. Usa Administración para modificarlo.",
    );
  store.users.push({
    id: randomUUID(),
    username,
    role: role as Role,
    passwordHash: await hashPassword(password),
    active: true,
    version: 1,
  });
  writeStore(store);
  console.log("Cuenta creada.");
} finally {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  unlock();
}
