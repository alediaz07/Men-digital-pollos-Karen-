import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QrCode } from 'lucide-react';
import {
  AppStatePayload,
  MenuItem,
  Order,
  OrderStatus,
  OrderType,
  RestaurantSettings,
  RestaurantTable,
} from './types';
import {
  INITIAL_MENU,
  INITIAL_SETTINGS,
  INITIAL_TABLES,
  LOGO_URL,
} from './data/initialData';
import { CustomerMenuView } from './components/CustomerMenuView';
import { ReceptionView } from './components/ReceptionView';
import { KitchenKDSView } from './components/KitchenKDSView';
import { AdminPanelView } from './components/AdminPanelView';
import { playNotificationChime } from './utils/format';

type AppView = 'customer' | 'reception' | 'kitchen' | 'admin';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('customer');
  const [menu, setMenu] = useState<MenuItem[]>(INITIAL_MENU);
  const [tables, setTables] = useState<RestaurantTable[]>(INITIAL_TABLES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings>(INITIAL_SETTINGS);

  // Customer mode & table state (driven by QR ?mesa=X or ?modo=expres)
  const [selectedTableId, setSelectedTableId] = useState<string | null>('mesa-1');
  const [orderMode, setOrderMode] = useState<OrderType>(OrderType.DINE_IN);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeViewRef = useRef<AppView>(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Parse URL parameters (?mesa=1..N or ?modo=expres)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mesaParam = params.get('mesa');
    const modoParam = params.get('modo');
    const vistaParam = params.get('vista');

    if (vistaParam === 'recepcion') setActiveView('reception');
    else if (vistaParam === 'cocina') setActiveView('kitchen');
    else if (vistaParam === 'admin') setActiveView('admin');

    if (modoParam === 'expres' || modoParam === 'express') {
      setOrderMode(OrderType.EXPRESS);
    } else if (mesaParam) {
      setOrderMode(OrderType.DINE_IN);
      const num = Number(mesaParam);
      const found = tables.find(
        (t) => t.number === num || t.id.toLowerCase() === mesaParam.toLowerCase()
      );
      if (found) {
        setSelectedTableId(found.id);
      }
    }
  }, [tables]);

  // Initial state fetch + WebSocket real-time synchronization
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    const applyServerState = (payload: AppStatePayload) => {
      if (!payload) return;
      if (Array.isArray(payload.menu)) setMenu(payload.menu);
      if (Array.isArray(payload.tables)) setTables(payload.tables);
      if (Array.isArray(payload.orders)) setOrders(payload.orders);
      if (payload.settings) setSettings(payload.settings);
    };

    // Fetch initial state via HTTP
    fetch('/api/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !isUnmounted) {
          applyServerState(data);
        }
      })
      .catch(() => {
        // Fallback to local initial state if offline
      });

    // Connect WebSocket on same host/port
    const connectWs = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.payload) {
              applyServerState(msg.payload);
            }
            if (msg.type === 'order:created') {
              playNotificationChime('reception');
              showToast('¡Nuevo pedido recibido en Recepción!');
            } else if (
              msg.type === 'order:updated' &&
              msg.status === OrderStatus.IN_KITCHEN
            ) {
              playNotificationChime('kitchen');
              showToast('Comanda aprobada y enviada a la Pantalla de Cocina (KDS)');
            } else if (
              msg.type === 'order:updated' &&
              msg.status === OrderStatus.READY
            ) {
              playNotificationChime('reception');
              showToast('¡Pedido marcado como LISTO en Cocina!');
            }
          } catch {
            // ignore malformed message
          }
        };
        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimer = setTimeout(connectWs, 2500);
          }
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Counters for navigation links
  const pendingReceptionCount = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PENDING_RECEPTION).length,
    [orders]
  );

  const activeKitchenCount = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.IN_KITCHEN).length,
    [orders]
  );

  // API Handlers
  const handleCreateOrder = async (orderPayload: Partial<Order>): Promise<Order> => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'No se pudo procesar el pedido.');
    }
    const created: Order = await res.json();
    setOrders((prev) => {
      if (prev.some((o) => o.id === created.id)) return prev;
      return [created, ...prev];
    });
    showToast(
      `¡Pedido #${created.orderNumber} enviado a Recepción! Puedes ver su estado en vivo.`
    );
    return created;
  };

  const handleUpdateOrder = async (orderId: string, updates: Partial<Order>) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated: Order = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    }
  };

  const handleSaveMenuItem = async (item: MenuItem) => {
    const res = await fetch('/api/menu/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      const saved: MenuItem = await res.json();
      setMenu((prev) => {
        const idx = prev.findIndex((m) => m.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [...prev, saved];
      });
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    const res = await fetch(`/api/menu/item/${itemId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setMenu((prev) => prev.filter((m) => m.id !== itemId));
    }
  };

  const handleSaveTables = async (updatedTables: RestaurantTable[]) => {
    const res = await fetch('/api/tables', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTables),
    });
    if (res.ok) {
      const saved = await res.json();
      setTables(saved);
    }
  };

  const handleSaveSettings = async (updatedSettings: Partial<RestaurantSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSettings),
    });
    if (res.ok) {
      const saved = await res.json();
      setSettings(saved);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 (Brand wordmark | 4 single-line nav links | 1 primary CTA) */}
      <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Brand logo and wordmark */}
          <a
            href="#menu"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('customer');
            }}
            className="flex items-center gap-2.5 font-display text-lg sm:text-xl font-extrabold tracking-tight text-[#C81E1E] whitespace-nowrap shrink-0"
          >
            <img
              src={LOGO_URL}
              alt="Logo Pollos Karen"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-contain bg-white border border-stone-200 p-0.5 shrink-0"
            />
            <span>Pollos Karen</span>
          </a>

          {/* Zone 2: 4 single-line text navigation links */}
          <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-semibold text-stone-600 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveView('customer')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'customer'
                  ? 'border-[#C81E1E] text-stone-900'
                  : 'border-transparent hover:text-stone-900'
              }`}
            >
              Menú Digital
            </button>
            <button
              type="button"
              onClick={() => setActiveView('reception')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'reception'
                  ? 'border-[#C81E1E] text-stone-900'
                  : 'border-transparent hover:text-stone-900'
              }`}
            >
              Recepción y Caja{pendingReceptionCount > 0 ? ` (${pendingReceptionCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('kitchen')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'kitchen'
                  ? 'border-[#C81E1E] text-stone-900'
                  : 'border-transparent hover:text-stone-900'
              }`}
            >
              Cocina KDS{activeKitchenCount > 0 ? ` (${activeKitchenCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'admin'
                  ? 'border-[#C81E1E] text-stone-900'
                  : 'border-transparent hover:text-stone-900'
              }`}
            >
              Administración
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className="px-3.5 py-2 text-xs font-bold text-white bg-stone-900 hover:bg-[#C81E1E] rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              Códigos QR Mesas
            </button>
          </div>
        </div>
      </header>

      {/* Real-time Notification Toast */}
      {toastMessage && (
        <div className="no-print fixed top-16 right-4 z-50 max-w-sm bg-stone-900 text-white px-4 py-3 rounded-xl shadow-lg border border-stone-700 text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-stone-400 hover:text-white text-xs font-bold"
          >
            OK
          </button>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1">
        {activeView === 'customer' && (
          <CustomerMenuView
            menu={menu}
            tables={tables}
            settings={settings}
            orders={orders}
            selectedTableId={selectedTableId}
            initialMode={orderMode}
            onSelectTable={(id) => {
              setSelectedTableId(id);
              setOrderMode(OrderType.DINE_IN);
            }}
            onSelectMode={(mode) => setOrderMode(mode)}
            onSubmitOrder={handleCreateOrder}
          />
        )}

        {activeView === 'reception' && (
          <ReceptionView
            orders={orders}
            settings={settings}
            onUpdateOrder={handleUpdateOrder}
          />
        )}

        {activeView === 'kitchen' && (
          <KitchenKDSView orders={orders} onUpdateOrder={handleUpdateOrder} />
        )}

        {activeView === 'admin' && (
          <AdminPanelView
            menu={menu}
            tables={tables}
            orders={orders}
            settings={settings}
            onSaveMenuItem={handleSaveMenuItem}
            onDeleteMenuItem={handleDeleteMenuItem}
            onSaveTables={handleSaveTables}
            onSaveSettings={handleSaveSettings}
            onSimulateScanTable={(tableId) => {
              setSelectedTableId(tableId);
              setOrderMode(OrderType.DINE_IN);
              setActiveView('customer');
            }}
            onSimulateExpress={() => {
              setOrderMode(OrderType.EXPRESS);
              setActiveView('customer');
            }}
          />
        )}
      </main>
    </div>
  );
}
