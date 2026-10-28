# Migración de Pollos Karen a Cloudflare Workers + D1

**Estado (27 de octubre de 2026):** La versión Cloudflare ya fue incorporada en `main`, su CI pasó y la migración remota `0001_initial.sql` se aplicó con éxito a `pollos-karen-db`. El Worker `pollos-karen-app` se conectó al repositorio mediante Cloudflare Builds; el despliegue de la aplicación completa está pendiente de confirmar. Hasta entonces puede responder únicamente la prueba D1. No aceptar pedidos reales sin completar el alta inicial y las pruebas controladas.

## Arquitectura

* React/Vite se entrega como activos estáticos de un Worker (no GitHub Pages).
* API segura de Worker, sin `fs`, `express`, ni sesiones en memoria.
* SQL de D1 guarda menú, QR, pedidos, imágenes SINPE privadas, cobros agrupados, usuarios y auditoría.
* Cada petición conserva privilegios por rol. Inventario continúa pausado; no hay descuento de existencias.
* Los dispositivos se sincronizan consultando `/api/state` por intervalos (de 8 a 20 segundos), evitando mantener WebSockets. Esta técnica no ofrece avisos instantáneos al milisegundo.
* Express únicamente recibe órdenes de lunes a viernes, entre 07:00 y 16:00 de Costa Rica. Fuera de horario puede verse el catálogo; el servidor rechaza pedidos.

## Activación de Cloudflare Builds

El Worker conectado a GitHub escucha los commits en la rama de producción `main`. Guardar el comando de compilación en Cloudflare no publica por sí solo la app; el siguiente commit en `main` provoca un build y despliegue automáticamente si la integración está funcionando.

- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Worker y nombre en `wrangler.toml`: `pollos-karen-app`

Comprobar en Cloudflare → Worker → Deployments que aparezca una versión nueva construida desde GitHub. **No ejecutar `/setup` sobre el Worker de prueba antiguo.** Después de publicar la aplicación completa, confirmar la pantalla `/setup` e inicializar el primer administrador usando el secreto `BOOTSTRAP_SECRET`, sin exponer la clave. Eliminar el secreto tras configurar el administrador.

## Primer despliegue (historial y pasos de verificación)

1. Verificar que `wrangler.toml` identifica la cuenta/base D1 correctas. ID D1: `d99819af-dece-4de3-9ac8-75c1b7ed39a5`.
2. En computador con Node/npm, ejecutar `npm ci`. El proyecto conserva un backend Node aparte para desarrollo; se compila el frontend Cloudflare con `npm run build:cloudflare`.
3. Ejecutar la migración D1 desde Wrangler, sin tocar los datos originales: `npx wrangler d1 migrations apply pollos-karen-db --remote`. **No ejecutar en esta fase**; la migración necesita revisión y respaldo previo.
4. Configurar en Cloudflare Worker → Settings → Variables and Secrets una clave **secreta** `BOOTSTRAP_SECRET`, aleatoria de 32 caracteres como mínimo. No enviarla por chat ni guardarla en GitHub.
5. Compilar y desplegar: `npm run build:cloudflare` y `npx wrangler deploy`. Para Builds conectadas a GitHub, la orden de construcción es `npm run build:cloudflare` y la de despliegue es `npx wrangler deploy`; no conectar aún sin pasar pruebas.
6. Abrir `/setup` en el dominio del Worker, ingresar secreto inicial, nombre de usuario administrador y contraseña fuerte (12+ caracteres). Este formulario solo funciona si D1 no tiene ningún usuario; no hay contraseñas predeterminadas.
7. Retirar `BOOTSTRAP_SECRET` del entorno cuando termine el alta inicial. Crear usuarios de cocina/recepción desde Administración.
8. Crear QR nuevos de las mesas desde Administración y reimprimirlos. No reutilizar los QR del servidor viejo; la D1 inicia vacía.
9. Probar dos tablets: caja/administración y cocina, junto con una orden de mesa y otra de exprés en horario, en modo controlado, sin clientes ni dinero reales.
10. Programar una exportación segura de D1, establecer retención de datos y una revisión de facturación/servicio de mesa antes de operar.

## Limitaciones y pendientes antes de uso real

* Los archivos JSON del servidor viejo **no se migran automáticamente** a D1. Hay que confirmar si existen ventas reales que deban conservarse; nunca subirlos a GitHub.
* La comprobación de cobertura exprés de 1 km sigue siendo **manual**.
* No hay datáfono ni conciliación con el banco.
* Los cobros son registros, no facturación electrónica.
* La política de respaldos D1, retención de comprobantes y recuperación necesita una prueba formal antes de aceptar órdenes reales.
* La cuota Free de Workers/D1 es limitada y puede producir errores si se supera; los trabajadores deben tener un procedimiento de contingencia para pedidos en papel.
* El repositorio conserva dos destinos: Node/Express para desarrollo previo y Worker para Cloudflare. No desplegar el proceso Node como si fuera un Worker.
