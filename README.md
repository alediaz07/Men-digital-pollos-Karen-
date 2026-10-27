# Pollos Karen — Menú digital QR + KDS

Sistema de pedidos en mesa, exprés y ventana para Pollos Karen, con tablet de Administración/POS, tablet de Cocina (KDS), caja, productos, mesas y estadísticas. **Inventario en pausa**.

## Instalación local

Requisitos: Node.js 24 y npm. No incluyas datos bancarios, contraseñas, pedidos de clientes ni credenciales en GitHub.

```bash
npm ci
cp .env.example .env
npm run setup-user -- admin admin
npm run dev
```

El script de creación de usuarios solicita una contraseña segura. Crea cuentas diferenciadas para recepción y cocina. Para una instalación nueva, `DATA_DIR` puede apuntar a un directorio local persistente, fuera del repositorio.

## Comprobación

```bash
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

El flujo: Cliente QR → recepción → cocina → listo → entrega / caja. Para cobrar SINPE es obligatorio verificar el ingreso en la cuenta bancaria e indicar una referencia bancaria que no se haya usado en otro pedido.

## Modalidades, entradas y permisos
- **Mesas:** `/mesa?qr=TOKEN` (solo QR activo de cada mesa, sin navegación a exprés ni administración). Aplica +10% por servicio de mesa conforme a la configuración actual.
- **Exprés:** `/expres` (solo menú público de domicilio). Aplica envío de ₡500 dentro de cobertura de 1 km, verificada por Administración. SINPE: captura + confirmación bancaria antes de cocina. Efectivo: se declara el monto para calcular el vuelto; cobro queda pendiente hasta entrega.
- **Administración/POS:** `/admin` (privado, rol administrador). Incluye comandas de ventana, mesa, envío a cocina, cuenta consolidada por mesa, caja con efectivo recibido y vuelto, comprobación SINPE, ventas y ajustes de horario exprés.
- **Recepción:** `/recepcion` (privado, rol recepción). Recibe y autoriza pedidos; las mesas se cobran juntas desde la Caja administrativa.
- **Cocina:** `/cocina` (privado, rol cocina). Solo recibe pedidos autorizados y marca "Listo"; no tiene acceso a precios, administración, caja o información del cliente.
Los clientes nunca reciben enlaces ni formularios de acceso al personal; cambiar manualmente la URL no otorga permisos. El QR es un token de mesa: si se comparte, podría utilizarse desde otro lugar, pero siempre requerirá aprobación interna antes de cocina.

## Horario del exprés
De lunes a viernes de **7:00 a.m. a 4:00 p.m.** hora de Costa Rica. **Sábado y domingo cerrado**. Fuera de ese rango muestra un cartel "Servicio exprés cerrado", permite consultar el menú y bloquea órdenes nuevas tanto en pantalla como en servidor. Administración puede modificar días/horas y aplicar cierre temporal para feriados sin cambiar código.

## Pago y caja
Los pedidos primero llegan a Administración/Recepción. Al ser autorizados pasan al KDS; Cocina pulsa "Listo" y Administración recibe actualización. El pago puede registrarse antes o después de preparar/entregar, sin conexión con datáfono. Las órdenes pueden acumularse por mesa y cerrarse en **un solo cobro**; al pagar efectivo se exige ingresar el importe recibido y se calcula el vuelto. Las ventas de ventana se cobran sin 10% ni tarifa exprés, al principio o al final, manteniendo el estado "Pendiente de pago" hasta registrar el cobro real.

## Inventario pausado
La información de insumos y recetas existente se conserva, pero se ha ocultado la sección del menú administrativo y **no se descuenta ni bloquea stock al aprobar un pedido**. Se retomará su diseño cuando el restaurante defina la forma de control.

## Datos y respaldos cifrados

Este repositorio aún utiliza **almacenamiento local en JSON con un único proceso**, no Supabase/PostgreSQL. Los comprobantes SINPE nuevos se guardan en `DATA_DIR/receipts`, separados del JSON; solo el personal autorizado puede descargarlos. Los comprobantes antiguos en formato base64 mantienen lectura de compatibilidad.

Para respaldar:

1. Configurar `BACKUP_DIR` en una carpeta externa y duradera, distinta de `DATA_DIR`.
2. Configurar `BACKUP_ENCRYPTION_KEY` con 32 bytes hexadecimales generados de forma segura.
3. Ejecutar `npm run backup` y conservar la clave en un gestor de secretos.

Para restaurar, detener el servidor, configurar `ALLOW_RESTORE=YES`, usar la misma clave y ejecutar `npm run restore -- /ruta/respaldo.pkb`. La restauración reemplaza los datos; confirma previamente dónde estás escribiendo y conserva una copia adicional. No subas claves o respaldos al repositorio.

## Precauciones de producción

- **No desplegar con datos reales sobre almacenamiento temporal de Cloud Run**. Requiere volumen duradero en instancia única o migrar a PostgreSQL/Supabase transaccional; las sesiones y WebSockets actuales tampoco soportan libremente varias instancias.
- Configurar `PUBLIC_ORIGIN` HTTPS, `DATA_DIR` absoluto, `DURABLE_STORAGE_CONFIRMED=true`, `NODE_ENV=production`, contraseñas y usuario administrador seguro.
- Verificar fiscalización y facturación electrónica con un proveedor autorizado antes de usar como comprobante fiscal.
- El servicio del 10% en mesas requiere revisar el procedimiento de servicio y la liquidación laboral aplicable en Costa Rica; el indicador `serviceFeesHeld` no es ganancia del restaurante.
- La verificación SINPE y la cobertura exprés son manuales; no se han integrado servicios bancarios ni mapas de geocodificación. La verificación geográfica no puede garantizarse por URL; la autorización interna sigue siendo necesaria.
- No están implementados completamente: arqueos de caja por turno, reembolsos conciliados, cuentas divididas, retención/borrado automático de datos personales ni alertas externas. El POS de ventana sí permite registrar pedidos presenciales. El encargado del negocio debe completar información y política de privacidad, probar copias externas y verificar el sistema en dispositivos reales.

Consulta también `docs/OPERACION.md` y `docs/AUDITORIA.md` para los controles previos.

## Rama y validación

Los cambios pasan por la rama `feat/qr-kds-v1-1-operativo` y GitHub Actions antes de fusionarse en `main`. Ningún resultado de GitHub Actions sustituye una prueba de aceptación del negocio en su servidor de producción.
