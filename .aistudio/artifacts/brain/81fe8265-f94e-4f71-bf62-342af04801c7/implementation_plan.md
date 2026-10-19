# Pollo Cervecero Karen — Sistema de Menú Digital (Mesas QR + Exprés), Recepción, Cocina (KDS) y Administración

Aplicación web integral para **Pollo Cervecero Karen** que digitaliza el menú oficial del restaurante tanto para **clientes en mesa mediante códigos QR** (con +10% de servicio y pago directo en caja) como para **pedidos por Servicio Exprés a 1 km a la redonda** (con tarifa de `₡500`, selección de pago en Efectivo o SINPE Móvil `8974-9499` y carga de captura de pantalla del comprobante), conectando en tiempo real con **Recepción / Caja**, la **Pantalla de Cocina (KDS)** y el **Panel Administrativo**.

## Revisión del Usuario y Decisiones Confirmadas

> [!IMPORTANT]
> Estas reglas operativas incorporan tus ajustes sobre el flujo de pago en mesa vs. servicio exprés:

- **Dos Modalidades de Pedido Claramente Diferenciadas**:
  1. **En Mesa (Escaneo de QR `?mesa=1..N`)**:
     - Suma automáticamente el **+10% de servicio en restaurante**.
     - El cliente envía su pedido directo desde el celular **sin tener que elegir método de pago ni subir comprobante en la mesa**.
     - El cobro se realiza **en la Caja**, donde el encargado registra el pago al cerrar la cuenta (**SINPE Móvil, Efectivo o Tarjeta**).
  2. **Servicio Exprés (Únicamente 1 km a la redonda)**:
     - Muestra claramente la condición de cobertura: **"Servicio exprés únicamente hasta 1 km a la redonda"** y solicita nombre, teléfono y dirección con señas.
     - No aplica el 10% de salón; en su lugar suma automáticamente **`₡500` de tarifa de exprés**.
     - El cliente **selecciona el método de pago al pedir**: **SINPE Móvil (`8974-9499`)** o **Efectivo**.
     - Si elige **SINPE Móvil**, la aplicación le permite **adjuntar la captura de pantalla del comprobante** desde su teléfono, la cual se envía junto con el pedido para que **Recepción / Caja** pueda ver la imagen del comprobante en pantalla completa antes de enviarlo a cocina.
- **Flujo Operativo en Dos Etapas (Recepción → Cocina)**:
  1. **Vista de Recepción / Caja**: Recibe los pedidos nuevos (tanto de Mesas como de Exprés), permite revisar la captura del comprobante SINPE en los pedidos exprés, aprobar con el botón **"Enviar a Cocina"**, y cobrar los pedidos de las mesas en caja al final.
  2. **Pantalla de Cocina (KDS)**: Muestra exclusivamente los pedidos aprobados por recepción en formato de comandas de alto contraste (*En Preparación* → *Listo para Servir / Despachar* → *Entregado*).
- **Herramientas del Panel Administrativo**:
  - Gestión completa del menú (precios en colones `₡`, disponibilidad activo/agotado, variantes y configuración rápida del **Plato del Día**).
  - Generador de **códigos QR imprimibles por número de mesa** y enlace/QR para **Pedidos Exprés**.
  - Configuración del **+10% de servicio en restaurante** y de la **tarifa exprés de `₡500`**.
  - **Resumen de ventas del día** e historial detallado de pedidos separando ventas en Salón vs. Exprés y métodos de pago.

---

## 1. Visión General y Concepto Principal

- **Qué Hace**: Carga el menú oficial de **Pollo Cervecero Karen** con todas sus categorías, horarios y precios reales (Desayunos, Casados con té frío, Comida Rápida, Refrescos y Plato del Día).
  - Si el cliente entra escaneando el **QR de una mesa**, pide directo a cocina con el +10% de servicio y paga al retirarse en caja.
  - Si el cliente elige **Servicio Exprés (1 km a la redonda)**, ingresa su dirección, se le suman `₡500` de envío, elige entre **Efectivo** o **SINPE Móvil `8974-9499`** y adjunta la captura de pantalla del comprobante SINPE.
- **Usuarios Objetivo**:
  - **Clientes en Mesa (QR)**: Piden rápido desde la mesa y pagan en caja.
  - **Clientes de Servicio Exprés (≤ 1 km)**: Piden a domicilio, adjuntan su comprobante SINPE o indican pago en efectivo.
  - **Encargado de Recepción / Caja**: Verifica pedidos entrantes, revisa capturas de comprobantes SINPE en pedidos exprés, los envía a cocina y registra el cobro en caja de las mesas.
  - **Personal de Cocina (Pantalla KDS)**: Prepara los pedidos aprobados diferenciando si son para **Mesa #** o **Exprés**.

---

## 2. Experiencia de Usuario y Diseño Visual

### Flujos Principales de Usuario

1. **Flujo del Cliente en Mesa (Escaneo QR)**:
   - Al escanear el código QR de la mesa (ej. `?mesa=3`), la app muestra el encabezado con **"Mesa 3 — Ordenar en Restaurante"**.
   - El cliente elige sus platillos y variantes (ej. *Empanada Pollo o Carne*, *Jugo Naranja o Manzana*, notas para cocina).
   - En el resumen de su pedido ve: **Subtotal + 10% de servicio en restaurante = Total en `₡`**, con una nota clara: *"El pago se realiza en caja (SINPE Móvil, efectivo o tarjeta)"*.
   - Confirma el pedido con un toque y ve en vivo el estado (*Recibido en Recepción* → *Preparándose en Cocina* → *¡Listo!*), pudiendo pedir platillos o refrescos adicionales durante su visita.

2. **Flujo del Cliente en Servicio Exprés (1 km a la redonda)**:
   - El cliente selecciona la modalidad **"Servicio Exprés (Máx. 1 km a la redonda)"**.
   - En el carrito revisa su cuenta: **Subtotal + `₡500` de tarifa exprés = Total en `₡`**.
   - Completa su **Nombre, Teléfono y Dirección exacta (dentro de 1 km a la redonda)**.
   - Selecciona su método de pago:
     - **SINPE Móvil (`8974-9499`)**: Muestra el número oficial con botón para copiarlo y un botón **"Adjuntar captura del comprobante SINPE"** que permite seleccionar la foto/captura desde el celular con vista previa inmediata.
     - **Efectivo**: Permite enviar el pedido e indicar opcionalmente con cuánto billete paga para llevarle el vuelto.

3. **Flujo de Recepción / Caja**:
   - **Recepción de Pedidos**:
     - Si es un pedido de **Mesa**, muestra la mesa, los platillos y el botón **"Aprobar y Enviar a Cocina"**.
     - Si es un pedido **Exprés**, muestra la etiqueta **"EXPRÉS (+₡500)"**, dirección, teléfono, método de pago (**SINPE o Efectivo**) y, si es SINPE, la **miniatura de la captura del comprobante** (con clic para ampliarla y verificar el monto antes de presionar **"Enviar a Cocina"**).
   - **Cobro en Caja (para Mesas)**:
     - Cuando los clientes de una mesa van a pagar en caja, el cajero selecciona la orden de la mesa, elige cómo pagaron en caja (**SINPE Móvil, Efectivo o Tarjeta**), calcula el vuelto si es efectivo, y marca la cuenta como **Pagada y Cerrada**.

4. **Flujo de Pantalla de Cocina (KDS)**:
   - Tablero en vivo con tarjetas claramente identificadas como **MESA 1..N** (para servir en plato) o **EXPRÉS** (para empacar para llevar), con cronómetro, variantes y botón **"Marcar Listo"**.

5. **Flujo del Panel Administrativo**:
   - **Menú y Plato del Día**: Editar precios, descripciones, horarios, agotar/activar productos y configurar el **Plato del Día (`₡2.500` con té frío)**.
   - **Mesas y Códigos QR**: Crear mesas, imprimir tarjetas QR para cada mesa y obtener el código QR / enlace directo para clientes de **Servicio Exprés**.
   - **Ventas e Historial**: Resumen del día con total en colones, desglose de ventas en restaurante (+10% servicio) vs. ventas exprés (+`₡500` envío), métodos de pago y visor de comprobantes SINPE recibidos.

### Identidad Visual y Tema

- **Dirección Estética**: Inspirada en el menú original de **Pollo Cervecero Karen**, con encabezados en rojo cervecero (`#C81E1E`), fondo crema cálido (`#FAF8F5`) de alta legibilidad y pantalla de cocina oscura (`#0F172A`) de alto contraste.
- **Tipografía**: **Fraunces / Outfit** para encabezados gastronómicos, **Plus Jakarta Sans** para interfaz y **JetBrains Mono** (`tabular-nums`) para precios en colones (`₡`), el 10% de servicio y la tarifa exprés de `₡500`.

---

## 3. Decisiones Clave de Producto y Justificación

- **Subida Real de Captura de Comprobante SINPE en Exprés**:
  - *Enfoque Elegido*: Compresión ligera automática en el navegador del cliente (Canvas JPEG/WebP optimizado) antes de enviarla al servidor.
  - *Por Qué*: Permite que cualquier captura de pantalla tomada desde celulares modernos cargue al instante en menos de 1 segundo y aparezca en tiempo real en la pantalla de Recepción sin saturar la red.
- **Separación Automática de Cargos (10% Salón vs. ₡500 Exprés)**:
  - *Enfoque Elegido*: La lógica de precios aplica automáticamente el **+10% de impuesto de servicio** cuando `orderType === 'dine_in'` (Mesa) y aplica **+`₡500` fijos** cuando `orderType === 'express'`.
  - *Por Qué*: Garantiza cuentas exactas sin cálculos manuales ni confusiones entre clientes de mesa y clientes a domicilio.

---

## 4. Arquitectura Técnica y Estrategia de Datos

### Diagrama de Arquitectura y Componentes

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   APLICACIÓN WEB — POLLO CERVECERO KAREN                   │
├──────────────────────────┬────────────────────────┬────────────────────────┤
│     VISTA CLIENTE        │    RECEPCIÓN / CAJA    │  PANTALLA COCINA (KDS) │
│ ┌──────────────────────┐ │ ┌────────────────────┐ │ ┌────────────────────┐ │
│ │ Modo Mesa (?mesa=1..)│ │ │ Cola Nuevos Pedidos│ │ │ Comandas Activas   │ │
│ │ • +10% Servicio      │ │ │ (Mesa vs Exprés)   │ │ │ (Salón vs Empaque) │ │
│ │ • Pago final en Caja │ │ ├────────────────────┤ │ ├────────────────────┤ │
│ ├──────────────────────┤ │ │ Visor de Captura   │ │ │ Temporizador y     │ │
│ │ Modo Exprés (≤ 1 km) │ │ │ Comprobante SINPE  │ │ │ Notas de Cocina    │ │
│ │ • +₡500 Tarifa Envío │ │ ├────────────────────┤ │ ├────────────────────┤ │
│ │ • Pago: SINPE o Efec │ │ │ Caja para Mesas:   │ │ │ Botón: Listo /     │ │
│ │ • Adjuntar Captura   │ │ │ Cobrar SINPE/Ef/Tar│ │ │ Despachado         │ │
│ └──────────┬───────────┘ └─┴─────────┬──────────┘ └─┴─────────┬──────────┘ │
│            │                         │                        │            │
│            ▼                         ▼                        ▼            │
├────────────────────────────────────────────────────────────────────────────┤
│                  PANEL ADMINISTRATIVO (Menú, QR y Ventas)                  │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────────┐  │
│  │ Gestor de Platillos  │ │ Generador QR Mesas   │ │ Ventas Salón (+10%)│  │
│  │ + Plato del Día      │ │ + QR Servicio Exprés │ │ vs Exprés (+₡500)  │  │
│  └──────────┬───────────┘ └──────────┬───────────┘ └─────────┬──────────┘  │
└─────────────┼────────────────────────┼───────────────────────┼─────────────┘
              │                        │                       │
              ▼                        ▼                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│            SERVIDOR EXPRESS + WEBSOCKETS (Sincronización Real-Time)        │
│  • API REST (/api/menu, /api/orders, /api/tables, /api/settings)           │
│  • Almacenamiento de capturas SINPE y difusión instantánea a Recepción/KDS │
└────────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Datos Actualizado (`Order`)

- **`orderType`**: `'dine_in'` (En Mesa) | `'express'` (Servicio Exprés ≤ 1 km).
- **Datos de Mesa (`dine_in`)**:
  - `tableId`, `tableName` (ej. *"Mesa 4"*).
  - `serviceFee`: `Math.round(subtotal * 0.10)` (+10% servicio en restaurante).
  - `deliveryFee`: `0`.
  - `paymentMethod`: se define al cobrar en **Caja** (`'pendiente_caja'` al pedir → `'sinpe'` | `'efectivo'` | `'tarjeta'` al pagar en caja).
- **Datos de Exprés (`express`)**:
  - `customerName`, `customerPhone`, `deliveryAddress` (con validación de radio máx. 1 km a la redonda).
  - `serviceFee`: `0`.
  - `deliveryFee`: `500` (`₡500` tarifa exprés).
  - `paymentMethod`: `'sinpe'` | `'efectivo'` (seleccionado por el cliente al ordenar).
  - `sinpeReceiptImage`: imagen en base64 optimizada de la captura de pantalla del comprobante SINPE adjuntada por el cliente.
  - `cashChangeFor`: monto opcional si paga en efectivo para calcular vuelto.
