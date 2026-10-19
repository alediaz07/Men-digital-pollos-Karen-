import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import {
  INITIAL_MENU,
  INITIAL_SETTINGS,
  INITIAL_TABLES,
} from './src/data/initialData.ts';
import {
  AppStatePayload,
  MenuItem,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  RestaurantSettings,
  RestaurantTable,
} from './src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'karen-store.json');

interface PersistedStore extends AppStatePayload {
  nextOrderNumber: number;
}

function getInitialSeedOrders(): Order[] {
  const now = new Date();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  return [
    {
      id: 'ord-demo-101',
      orderNumber: 101,
      orderType: OrderType.DINE_IN,
      tableId: 'mesa-3',
      tableName: 'Mesa 3',
      items: [
        {
          id: 'item-1',
          menuItemId: 'cas-pollo-frito',
          name: 'POLLO FRITO',
          price: 3000,
          quantity: 2,
          notes: '1 sin picadillo por favor',
        },
        {
          id: 'item-2',
          menuItemId: 'ref-jugo',
          name: 'JUGO (Naranja o Manzana)',
          price: 800,
          quantity: 1,
          selectedVariant: 'Naranja',
        },
      ],
      subtotal: 6800,
      serviceFee: 680,
      deliveryFee: 0,
      total: 7480,
      paymentMethod: PaymentMethod.PENDING_CAJA,
      isPaid: false,
      status: OrderStatus.PENDING_RECEPTION,
      createdAt: twoMinsAgo,
    },
    {
      id: 'ord-demo-100',
      orderNumber: 100,
      orderType: OrderType.DINE_IN,
      tableId: 'mesa-1',
      tableName: 'Mesa 1',
      items: [
        {
          id: 'item-3',
          menuItemId: 'rap-2-piezas-pollo',
          name: '2 PIEZAS DE POLLO',
          price: 2500,
          quantity: 1,
        },
        {
          id: 'item-4',
          menuItemId: 'cas-chifrijo',
          name: 'CHIFRIJO',
          price: 2500,
          quantity: 1,
        },
      ],
      subtotal: 5000,
      serviceFee: 500,
      deliveryFee: 0,
      total: 5500,
      paymentMethod: PaymentMethod.PENDING_CAJA,
      isPaid: false,
      status: OrderStatus.IN_KITCHEN,
      createdAt: fiveMinsAgo,
      sentToKitchenAt: twoMinsAgo,
    },
  ];
}

function loadStore(): PersistedStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStore;
      if (parsed && Array.isArray(parsed.menu) && Array.isArray(parsed.tables)) {
        if (
          parsed.settings &&
          parsed.settings.restaurantName === 'Pollo Cervecero Karen'
        ) {
          parsed.settings.restaurantName = 'Pollos Karen';
          parsed.settings.sinpeOwnerName = 'Pollos Karen';
          saveStore(parsed);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading persisted store, using default seed:', e);
  }

  const initial: PersistedStore = {
    menu: INITIAL_MENU,
    tables: INITIAL_TABLES,
    orders: getInitialSeedOrders(),
    settings: INITIAL_SETTINGS,
    nextOrderNumber: 102,
  };
  saveStore(initial);
  return initial;
}

function saveStore(store: PersistedStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to persist store:', e);
  }
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.use(express.json({ limit: '10mb' }));

  const store = loadStore();

  function getPublicState(): AppStatePayload {
    return {
      menu: store.menu,
      tables: store.tables,
      orders: store.orders,
      settings: store.settings,
    };
  }

  function broadcastState(eventType = 'state:sync', extra?: Record<string, unknown>) {
    const message = JSON.stringify({
      type: eventType,
      payload: getPublicState(),
      ...extra,
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        payload: getPublicState(),
      })
    );
  });

  // --- API ROUTES ---

  // Get full application state
  app.get('/api/state', (_req, res) => {
    res.json(getPublicState());
  });

  // Create new order (from Table QR or Express <= 1km)
  app.post('/api/orders', (req, res) => {
    const body = req.body as Partial<Order>;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: 'El pedido debe contener al menos un platillo.' });
      return;
    }

    const orderType: OrderType =
      body.orderType === OrderType.EXPRESS ? OrderType.EXPRESS : OrderType.DINE_IN;

    const subtotal = body.items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0
    );

    const serviceFee =
      orderType === OrderType.DINE_IN
        ? Math.round(subtotal * (store.settings.serviceChargePercent / 100))
        : 0;

    const deliveryFee =
      orderType === OrderType.EXPRESS ? store.settings.expressDeliveryFee : 0;

    const total = subtotal + serviceFee + deliveryFee;

    const newOrder: Order = {
      id: body.id || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderNumber: store.nextOrderNumber++,
      orderType,
      tableId: orderType === OrderType.DINE_IN ? body.tableId : undefined,
      tableName: orderType === OrderType.DINE_IN ? body.tableName : undefined,
      customerName: body.customerName?.trim() || undefined,
      customerPhone: body.customerPhone?.trim() || undefined,
      deliveryAddress:
        orderType === OrderType.EXPRESS ? body.deliveryAddress?.trim() : undefined,
      withinOneKmConfirmed:
        orderType === OrderType.EXPRESS ? Boolean(body.withinOneKmConfirmed) : undefined,
      items: body.items,
      subtotal,
      serviceFee,
      deliveryFee,
      total,
      paymentMethod:
        orderType === OrderType.DINE_IN
          ? PaymentMethod.PENDING_CAJA
          : body.paymentMethod === PaymentMethod.SINPE
          ? PaymentMethod.SINPE
          : PaymentMethod.EFECTIVO,
      sinpeReference: body.sinpeReference?.trim() || undefined,
      sinpeReceiptImage: body.sinpeReceiptImage || undefined,
      cashChangeFor: body.cashChangeFor ? Number(body.cashChangeFor) : undefined,
      isPaid: Boolean(body.isPaid),
      status: OrderStatus.PENDING_RECEPTION,
      createdAt: new Date().toISOString(),
    };

    // Idempotency guard
    const existingIndex = store.orders.findIndex((o) => o.id === newOrder.id);
    if (existingIndex === -1) {
      store.orders.unshift(newOrder);
      saveStore(store);
      broadcastState('order:created', { orderId: newOrder.id });
    }

    res.status(201).json(newOrder);
  });

  // Update order status or cashier payment (Reception, Cashier, Kitchen KDS)
  app.patch('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body as Partial<Order>;
    const orderIndex = store.orders.findIndex((o) => o.id === id);

    if (orderIndex === -1) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    const existing = store.orders[orderIndex];
    const nowIso = new Date().toISOString();

    const updated: Order = {
      ...existing,
      ...updates,
    };

    if (
      updates.status === OrderStatus.IN_KITCHEN &&
      existing.status !== OrderStatus.IN_KITCHEN
    ) {
      updated.sentToKitchenAt = nowIso;
    }
    if (updates.status === OrderStatus.READY && existing.status !== OrderStatus.READY) {
      updated.readyAt = nowIso;
    }
    if (
      updates.status === OrderStatus.DELIVERED &&
      existing.status !== OrderStatus.DELIVERED
    ) {
      updated.deliveredAt = nowIso;
    }
    if (updates.isPaid === true && !existing.isPaid) {
      updated.paidAt = nowIso;
    }

    store.orders[orderIndex] = updated;
    saveStore(store);
    broadcastState('order:updated', { orderId: updated.id, status: updated.status });

    res.json(updated);
  });

  // Delete or clear completed orders if requested by admin
  app.delete('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    store.orders = store.orders.filter((o) => o.id !== id);
    saveStore(store);
    broadcastState('order:deleted', { orderId: id });
    res.json({ ok: true });
  });

  // Menu CRUD
  app.put('/api/menu', (req, res) => {
    const items = req.body as MenuItem[];
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Formato de menú inválido.' });
      return;
    }
    store.menu = items;
    saveStore(store);
    broadcastState('menu:updated');
    res.json(store.menu);
  });

  app.post('/api/menu/item', (req, res) => {
    const item = req.body as MenuItem;
    if (!item || !item.name || typeof item.price !== 'number') {
      res.status(400).json({ error: 'Datos de platillo incompletos.' });
      return;
    }
    const newItem: MenuItem = {
      ...item,
      id: item.id || `item-${Date.now()}`,
    };
    const idx = store.menu.findIndex((m) => m.id === newItem.id);
    if (idx >= 0) {
      store.menu[idx] = newItem;
    } else {
      store.menu.push(newItem);
    }
    saveStore(store);
    broadcastState('menu:updated');
    res.json(newItem);
  });

  app.delete('/api/menu/item/:id', (req, res) => {
    const { id } = req.params;
    store.menu = store.menu.filter((m) => m.id !== id);
    saveStore(store);
    broadcastState('menu:updated');
    res.json({ ok: true });
  });

  // Tables CRUD
  app.put('/api/tables', (req, res) => {
    const tables = req.body as RestaurantTable[];
    if (!Array.isArray(tables)) {
      res.status(400).json({ error: 'Formato de mesas inválido.' });
      return;
    }
    store.tables = tables;
    saveStore(store);
    broadcastState('tables:updated');
    res.json(store.tables);
  });

  // Settings update
  app.put('/api/settings', (req, res) => {
    const settings = req.body as Partial<RestaurantSettings>;
    store.settings = {
      ...store.settings,
      ...settings,
    };
    saveStore(store);
    broadcastState('settings:updated');
    res.json(store.settings);
  });

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Pollo Cervecero Karen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
