# Pollos Karen: operación y despliegue

La aplicación conserva React, TypeScript, Vite, Express, el catálogo y la identidad visual existentes. El servidor es la autoridad para cuentas, permisos, pedidos, precios y cobros.

## Instalación y primer acceso

Requisitos: Node.js 22.12+ (validado con Node 24), npm y un sistema de archivos local persistente. Instalar con `npm ci`. También se conserva `bun.lock` actualizado para los entornos que usan Bun.

1. Copiar `.env.example` a `.env` y ajustar el entorno.
2. Con el servidor detenido, ejecutar `npm run setup-user -- nombre-admin admin`. El procedimiento solicita una contraseña de 12 a 128 caracteres sin mostrarla. No hay cuentas ni contraseñas predeterminadas.
3. Ejecutar `npm run dev` para desarrollo. Abrir `/admin` e ingresar con la cuenta creada.
4. En **Ventas y Tarifas → Cuentas y permisos**, crear cuentas individuales de recepción y cocina. Una contraseña vacía conserva la existente al editar. Cambiar rol, estado o contraseña invalida las sesiones anteriores.
5. Desde **Mesas y Códigos QR**, imprimir los QR nuevos. Los enlaces antiguos `?mesa=3` ya no habilitan consumo en mesa.

Las cuentas también pueden crearse con el servidor detenido mediante `npm run setup-user -- nombre reception` o `npm run setup-user -- nombre kitchen`.

## Interfaces

| Ruta | Acceso | Operación |
| --- | --- | --- |
| `/` | Público | Exprés sin servicio de mesa |
| `/?qr=TOKEN` | Público, token validado | Mesa identificada, servicio exacto del 10% |
| `/recepcion` | Recepción o administrador | Aprobar, verificar dirección/SINPE, cobrar y entregar |
| `/cocina` | Cocina o administrador | Preparar y marcar listo; sin información financiera o de contacto |
| `/admin` | Administrador | Catálogo, mesas, QR, tarifas, cuentas e indicadores |

La cookie privada del cliente permite recuperar sus pedidos en el mismo navegador durante 90 días, incluso tras reiniciar el servidor. No contiene la contraseña. Borrar las cookies pierde ese acceso; recepción conserva el pedido. Un QR de mesa no permite consultar los pedidos de otras personas. Compartir el QR tampoco demuestra presencia física en el restaurante.

El flujo es recepción → cocina → listo → entregado. El cobro se registra por separado. La captura SINPE nunca marca automáticamente un pedido como pagado: el personal debe verificar el abono bancario. La cobertura exprés requiere verificación de la dirección por recepción antes de aprobar. No existe verificación geográfica automática.

Los pedidos pagados no se pueden cancelar ni cambiar de método de pago: una devolución requiere conciliación fuera de esta versión. No hay una integración bancaria, pasarela de tarjeta ni facturación fiscal electrónica; el sistema registra los cobros confirmados por caja.

## Producción

Ejecutar `npm run build` y después `npm start` con:

- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://dominio-real` (origen exacto, sin barra final)
- `DATA_DIR` absoluto apuntando a un volumen local duradero
- `DURABLE_STORAGE_CONFIRMED=true`, únicamente después de comprobar el volumen
- `PORT` y `HOST` según el servidor

El arranque de producción se bloquea si faltan estas garantías. HTTPS debe terminar en el servidor o proxy del despliegue. Debe reenviar WebSockets a `/ws` en el mismo origen. Las cookies de producción tienen Secure, HttpOnly y SameSite=Strict. Las sesiones del personal duran 8 horas y terminan al reiniciar; no se almacena su contraseña en el navegador.

El desarrollo conserva Vite y `DISABLE_HMR` para AI Studio. Las credenciales de Gemini no se exponen mediante Vite. La compatibilidad con el entorno real de AI Studio/despliegue debe probarse allí: no se accedió a ese entorno durante este trabajo.

### Almacenamiento

Esta implementación admite **una sola instancia/proceso por almacén** y un disco local persistente con reemplazo atómico de archivos. El bloqueo de proceso no es un bloqueo distribuido entre servidores/contenedores. No activar réplicas ni compartir el JSON entre múltiples máquinas. El archivo JSON en almacenamiento temporal no constituye persistencia de producción.

No se contrató ni incorporó un servicio externo. Si el alojamiento no ofrece un volumen apropiado, hay que elegir almacenamiento duradero y migrarlo antes de operar; no marcar `DURABLE_STORAGE_CONFIRMED=true` para eludir esa decisión. La persistencia del alojamiento real permanece pendiente de verificación.

Cada cambio se escribe en un temporal, se sincroniza y se reemplaza el archivo principal. Solo después se confirma y difunde la operación. Se conserva `.bak` y una copia anterior a cada arranque/migración. Los errores no reinicializan el almacén ni confirman modificaciones. No eliminar automáticamente copias previas: establecer retención, espacio disponible y copia externa según la operación del restaurante.

Antes de actualizar la instalación real:

1. Detener el servidor y copiar íntegra la carpeta de datos a una ubicación segura.
2. Usar la misma carpeta como `DATA_DIR`. Nunca sustituirla por la carpeta de pruebas.
3. Crear la cuenta administradora y arrancar la aplicación.
4. Comprobar pedidos, precios, mesas y tarifas; imprimir los QR nuevos.
5. Probar reinicio y restauración de copia en el alojamiento elegido antes de recibir pedidos reales.

Para recuperar un archivo dañado, detener el servidor, conservar el archivo dañado para diagnóstico y restaurar una copia **verificada** de `karen-store.json`. El arranque falla ante JSON inválido en lugar de borrar información. Las cuentas y hashes están dentro del mismo almacén. Proteger la carpeta y las copias con permisos del sistema operativo; no publicarlas ni subirlas a GitHub.

Los dos identificadores de demostración conocidos (`ord-demo-100` y `ord-demo-101`) se conservan, marcados como pruebas y excluidos de las pantallas operativas normales y de las métricas. Los pedidos reales existentes no se borran. Los pedidos históricos sin identidad de cliente quedan disponibles para el personal; no se concede acceso público basándose únicamente en su número.

## Pruebas reproducibles

- `npm run lint`: TypeScript.
- `npm run build`: bundle de Vite.
- `npm test`: integración HTTP/WebSocket, seguridad, importes, persistencia y métricas; usa carpetas temporales y las elimina al terminar.
- `npx playwright install chromium`, después `npm run build` y `npm run test:browser`: flujo de interfaces con navegadores y datos aislados. Genera capturas en `.tools/screenshots`.

Las contraseñas que aparecen en los archivos de prueba son exclusivamente fixtures de almacenes temporales. No se crean esas cuentas al arrancar normalmente. `TEST_MODE=true` etiqueta todos los pedidos de un servidor de pruebas y está prohibido en producción.

Los filtros usan America/Costa_Rica. Los ingresos se asignan por `paidAt`; pedidos y pendientes, por fecha de creación. Para pedidos históricos pagados que no tengan `paidAt`, se utiliza su fecha de creación, por falta de una fecha de cobro más precisa. Deben conciliarse si se requieren cierres históricos exactos.
