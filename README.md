# Pollos Karen — Menú digital QR + KDS

Sistema de pedidos en mesa y exprés para Pollos Karen, con recepción, cocina (KDS), caja, productos, mesas, estadísticas y control básico de inventarios y recetas.

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

## Control de insumos

El administrador dispone de **Inventario y recetas**. Permite registrar insumos, mínimos, unidades, ajustes positivos y negativos con motivo, y una receta por platillo. Al enviar un pedido a cocina se descuenta la receta exactamente una vez. Si no alcanza el stock, no se aprueba el pedido. **Los productos sin receta no descuentan ingredientes**: ingresa los datos reales antes de utilizarlos.

Los cambios de estados, pagos, cobertura, existencias y recetas generan una bitácora interna consultable por administrador en `/api/admin/audit`. Los KPIs financieros básicos están en `/api/admin/kpis`.

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
- La verificación SINPE y la cobertura exprés son manuales; no se han integrado servicios bancarios ni mapas de geocodificación.
- No están implementados completamente: arqueos, reembolsos conciliados, caja dividida, pedidos presenciales, retención/borrado automático de datos personales ni alertas externas. El encargado del negocio debe completar información y política de privacidad, probar copias externas y verificar el sistema en dispositivos reales.

Consulta también `docs/OPERACION.md` y `docs/AUDITORIA.md` para los controles previos.

## Rama y validación

Los cambios pasan por la rama `feat/qr-kds-v1-1-operativo` y GitHub Actions antes de fusionarse en `main`. Ningún resultado de GitHub Actions sustituye una prueba de aceptación del negocio en su servidor de producción.
