# Auditoría y validación de Pollos Karen

## Hallazgos originales

- `/api/state` y WebSocket publicaban todos los pedidos, teléfonos, direcciones y comprobantes.
- Los endpoints de pedidos, catálogo, mesas y configuración no exigían autenticación.
- El pedido aceptaba precios, pagos y atributos controlados por el navegador; PATCH permitía sustituir cualquier propiedad.
- El menú iniciaba en Mesa 1 y permitía elegir arbitrariamente mesa/modalidad.
- Los QR contenían números de mesa predecibles.
- Había pedidos ficticios al iniciar y las estadísticas sumaban pedidos sin cobrar.
- Las escrituras de JSON podían fallar sin impedir una respuesta exitosa; un error de lectura activaba datos iniciales.
- La instalación npm tenía un conflicto entre Vite 8 y esbuild 0.25; `start` utilizaba Node directamente con sintaxis TypeScript no compatible.

## Correcciones

Se mantuvieron catálogo, precios iniciales, variantes, logo, componentes, React, Vite, Express, QR descargables e impresión. Se retiraron selectores públicos de mesa/modalidad y navegación interna pública. El botón de despacho en cocina se sustituyó por una indicación de que recepción confirma la entrega, de acuerdo con la separación solicitada.

Se agregaron sesiones del personal, scrypt con sal individual, cookies privadas, protección CSRF y de origen, límite de intentos, permisos de API y WebSocket y gestión de cuentas. Los comprobantes usan una ruta privada y no viajan en cada difusión. Los clientes reciben exclusivamente sus pedidos mediante una identidad aleatoria en cookie HttpOnly; cocina recibe una proyección sin precios ni datos de contacto.

Los QR tienen tokens aleatorios de 256 bits, validación de mesa activa y regeneración desde administración. El servidor calcula productos, cantidades, variantes, subtotal, servicio 10%, tarifa y total. Los reintentos tienen claves idempotentes vinculadas al cliente, sin consumir consecutivos adicionales. Se validan transiciones, cobertura y verificación manual SINPE; las capturas no pagan pedidos.

Las conexiones recuperan instantáneas al reconectarse, usan revisiones para evitar aplicar estados antiguos y tienen heartbeat. Hay estado de conexión, notificaciones visuales y activación explícita de sonido. KDS actualiza el tiempo transcurrido periódicamente.

El JSON usa reemplazo atómico, sincronización del archivo, copias, bloqueo de proceso y confirmación posterior al guardado. Se conservan los registros reales. La producción requiere declarar explícitamente volumen persistente y origen HTTPS; no se considera validado el alojamiento real.

## Archivos

| Área | Archivos |
| --- | --- |
| API, autenticación, persistencia | `server.ts`, `backend/security.ts`, `backend/store.ts` |
| Rutas, sesión y sincronización | `src/App.tsx`, `src/utils/api.ts` |
| Interfaces conservadas y ajustadas | Los cuatro componentes en `src/components`, más `StaffAccounts.tsx` |
| Modelos, métricas y sonido | `src/types.ts`, `src/utils/sales.ts`, `src/utils/format.ts` |
| Inicio seguro de cuentas | `scripts/create-user.ts` |
| Dependencias y configuración | `package.json`, `package-lock.json`, `bun.lock`, `vite.config.ts`, `.env.example`, `.gitignore` |
| Pruebas y operación | `tests/integration.test.ts`, `tests/browser.spec.ts`, `docs/OPERACION.md` |

## Resultados

Las comprobaciones se ejecutaron en Windows con Node 24 y Chromium, usando exclusivamente almacenes temporales. No se conectó una cuenta bancaria ni se procesó dinero real.

- TypeScript y build: aprobados.
- Integración: 13/13 pruebas aprobadas con `npm test`.
- Navegador: 1/1 prueba aprobada; flujo completo móvil → recepción → cocina → cobro → entrega, exprés, acceso a administración y comprobación de desbordamiento a 375, 390, 768 y 1280 px.
- Mesa 3: subtotal ₡3.000, servicio ₡300, total ₡3.300; servidor guarda mesa y modalidad.
- Exprés: subtotal ₡3.000, servicio ₡0, entrega ₡500, total ₡3.500.
- Roles, CSRF, privacidad HTTP/WS, comprobantes, cantidades, variantes, idempotencia, sesiones y QR revocados: cubiertos por integración.
- Reinicio: conserva pedidos, pago, catálogo y tarifa; invalida sesiones del personal.
- Fallo de escritura inducido: devuelve error y no altera estado ni revisión.
- Almacén nuevo: cero pedidos; JSON corrupto: detiene la carga sin reemplazarlo.
- Solicitudes simultáneas: identificadores y consecutivos únicos.
- Métricas: excluyen pruebas, cancelados e impagos y usan fechas de Costa Rica.

El primer intento de integración estuvo bloqueado por permisos de reemplazo de archivos del sandbox; se ejecutó correctamente fuera de esa restricción, con datos temporales. Una prueba de navegador inicialmente usaba un nombre incorrecto de pestaña; se corrigió. Una prueba de permisos se ajustó para iniciar de nuevo la sesión después de comprobar su invalidación por reinicio.

## NO VERIFICADO y pendientes de producción

- iPhone/Safari, Android físico, iPad real, impresora y lectura del QR con cámara física. Se verificaron Chromium y anchos de pantalla, no esos dispositivos.
- Sonido audible en los dispositivos reales y sus políticas de reproducción.
- Despliegue real, dominio, HTTPS del alojamiento, proxy y durabilidad de su disco después de desplegar.
- Datos reales de `.data/karen-store.json`: no estaban en el repositorio clonado; no se inspeccionaron ni modificaron.
- Cuentas reales: debe crearse el administrador mediante el procedimiento documentado. No se incluyeron credenciales de producción.
- Abonos SINPE, terminal de tarjeta, cobertura geográfica y pagos monetarios reales. La validación de dinero recibido corresponde al personal.
- Carga prolongada, múltiples instancias y recuperación ante corte eléctrico físico. Esta versión exige una sola instancia y disco duradero; no es una base de datos distribuida.

No se ha declarado la aplicación desplegada ni lista para recibir pedidos reales hasta configurar y validar estos requisitos del alojamiento. Las copias contienen datos personales y deben protegerse. El registro de pagos admite conciliación manual, no devoluciones automáticas ni facturación electrónica.

