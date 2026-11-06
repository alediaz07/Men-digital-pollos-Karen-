# Validación previa a producción — Pollos Karen

Esta lista es una puerta de aprobación, no una declaración de que el despliegue está listo. No introducir pedidos reales durante las pruebas.

## 1. Persistencia (obligatorio)
- [ ] Identificar proveedor, dominio, proceso único y ruta absoluta de DATA_DIR.
- [ ] Comprobar que DATA_DIR es un volumen persistente que sobrevive reinicios **y despliegues**; no confiar en el sistema de archivos efímero de un contenedor.
- [ ] Configurar PUBLIC_ORIGIN=https://dominio, NODE_ENV=production y DURABLE_STORAGE_CONFIRMED=true **solo después de verificar el volumen**.
- [ ] Configurar BACKUP_DIR externo y BACKUP_ENCRYPTION_KEY fuera de GitHub.
- [ ] Ejecutar un respaldo cifrado y restaurarlo en un entorno aislado; nunca restaurar sobre producción durante la prueba.
- [ ] Verificar pedidos y usuarios tras reiniciar el servicio; guardar evidencia de la prueba.

## 2. Pruebas automáticas
En una instalación de desarrollo aislada: npm ci; npm run lint; npm run build; npm test; npm run test:browser (requiere Chromium Playwright).
En el dominio HTTPS publicado: node scripts/smoke-production.mjs https://dominio
Este smoke test es de **solo lectura**; comprueba sesión pública, catálogo, horario y rechazo de QR inválido. No valida persistencia, pago, impresión, ni conectividad entre tablets.

## 3. Prueba de aceptación con tablets y datos ficticios
- [ ] Generar QR activo para una de las ocho mesas, escanearlo desde un teléfono real y comprobar la mesa correcta.
- [ ] Crear un pedido de prueba en mesa y confirmar el 10% de servicio.
- [ ] Aprobar en recepción; comprobar que solo entonces aparece en cocina.
- [ ] Marcar listo en cocina y verificar aviso en recepción; probar sonido en iPad.
- [ ] Cobrar con efectivo de prueba, comprobar vuelto y que el pago quede registrado.
- [ ] Comprobar pedido POS de ventana pendiente de pago y cobro al final.
- [ ] Comprobar exprés abierto/cerrado según horario de Costa Rica y envío ₡500; la cobertura de 1 km se verifica manualmente.
- [ ] Probar SINPE **sin dinero real**: el comprobante no debe marcar pagado sin verificación del personal.
- [ ] Cerrar sesión de cocina e intentar acceder a /admin: debe denegarse.
- [ ] Probar Safari iPad, impresión de ticket y reconexión después de cortar la red.

## 4. Operación pendiente
Arqueos por turno, reembolsos conciliados, cuentas divididas y borrado de datos personales siguen pendientes. No afirmar que el sistema factura electrónicamente. No activar réplicas de servidor compartiendo el JSON local.

**Criterio de salida:** no operar con pedidos reales hasta verificar persistencia, respaldo recuperable, dominio HTTPS y prueba completa de aceptación en dispositivos reales.
