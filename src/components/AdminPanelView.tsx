import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { api } from '../utils/api';
import { sales, dateRange, costaRicaDate } from '../utils/sales';
import { StaffAccounts } from './StaffAccounts';
import { AdminPOSView } from './AdminPOSView';
import { AdminCashierView } from './AdminCashierView';
import { ReceptionView } from './ReceptionView';
import {
  QrCode,
  Printer,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  TrendingUp,
  Utensils,
  Bike,
  Settings,
  ExternalLink,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  CategoryId,
  MenuItem,
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  RestaurantSettings,
  RestaurantTable,
} from '../types';
import { CATEGORY_META, LOGO_URL } from '../data/initialData';
import { formatColones } from '../utils/format';

interface AdminPanelViewProps {
  menu: MenuItem[];
  tables: RestaurantTable[];
  orders: Order[];
  settings: RestaurantSettings;
  onSaveMenuItem: (item: MenuItem) => Promise<void>;
  onDeleteMenuItem: (itemId: string) => Promise<void>;
  onSaveTables: (tables: RestaurantTable[]) => Promise<void>;
  onSaveSettings: (settings: Partial<RestaurantSettings>) => Promise<void>;
  onSimulateScanTable: (tableId: string) => void;
  onSimulateExpress: () => void;
  onUpdateOrder: (id:string, updates:Partial<Order>)=>Promise<void>;
  onCreatePOS: (payload:any)=>Promise<Order>;
  onCheckout: (payload:any)=>Promise<any>;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  menu,
  tables,
  orders,
  settings,
  onSaveMenuItem,
  onDeleteMenuItem,
  onSaveTables,
  onSaveSettings,
  onSimulateScanTable,
  onSimulateExpress,
  onUpdateOrder,
  onCreatePOS,
  onCheckout,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'pedidos' | 'caja' | 'qr' | 'menu' | 'sales' | 'expres'>('pos');

  // QR Code Data URLs map
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [expressQrUrl, setExpressQrUrl] = useState<string>('');
  const [newTableName, setNewTableName] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState(4);

  // Menu Editing State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [variantsInput, setVariantsInput] = useState('');
  const [dailySpecialNote, setDailySpecialNote] = useState(
    settings.dailySpecialDescription
  );
  const [savedDailyBanner, setSavedDailyBanner] = useState(false);

  // Settings Editing State
  const [sinpeInput, setSinpeInput] = useState(settings.sinpeNumber);
  const [servicePercentInput, setServicePercentInput] = useState(
    settings.serviceChargePercent
  );
  const [radiusInput, setRadiusInput] = useState(settings.expressRadiusKm);
  const [expressFeeInput, setExpressFeeInput] = useState(settings.expressDeliveryFee);
  const [savedSettingsMsg, setSavedSettingsMsg] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    let isMounted = true;
    async function generateAllQrs() {
      const map: Record<string, string> = {};
      for (const table of tables) {
        const targetUrl = `${baseUrl}/mesa?qr=${encodeURIComponent(table.qrToken || "")}`;
        try {
          map[table.id] = await QRCode.toDataURL(targetUrl, {
            width: 320,
            margin: 2,
            color: {
              dark: '#1C1917',
              light: '#FFFFFF',
            },
          });
        } catch {
          // ignore
        }
      }
      try {
        const expUrl = await QRCode.toDataURL(`${baseUrl}/expres`, {
          width: 320,
          margin: 2,
          color: {
            dark: '#C81E1E',
            light: '#FFFFFF',
          },
        });
        if (isMounted) setExpressQrUrl(expUrl);
      } catch {
        // ignore
      }
      if (isMounted) setQrDataUrls(map);
    }
    generateAllQrs();
    return () => {
      isMounted = false;
    };
  }, [tables, baseUrl]);

  const [period, setPeriod] = useState('today');
  const [from, setFrom] = useState(costaRicaDate(new Date().toISOString()));
  const [to, setTo] = useState(from);
  // Sales KPIs
  const salesMetrics = useMemo(() => { const [start,end] = dateRange(period,from,to); return sales(orders,start,end); }, [orders,period,from,to]);

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextNumber =
      tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
    const name = newTableName.trim() || `Mesa ${nextNumber}`;
    const newTable: RestaurantTable = {
      id: `mesa-${nextNumber}-${Date.now().toString().slice(-3)}`,
      number: nextNumber,
      name,
      capacity: Number(newTableCapacity) || 4,
      active: true,
    };
    await onSaveTables([...tables, newTable]);
    setNewTableName('');
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!window.confirm("¿Eliminar esta mesa y revocar su QR?")) return;
    await onSaveTables(tables.filter((t) => t.id !== tableId));
  };

  const handleStartCreateDish = () => {
    setEditingItem({
      id: `item-${Date.now()}`,
      name: '',
      category: CategoryId.CASADOS,
      price: 3000,
      description: 'Arroz - Frijoles - Ensalada - Picadillo · Con té frío',
      scheduleText: 'De 10:30am a 3:00pm',
      variants: [],
      available: true,
    });
    setVariantsInput('');
  };

  const handleStartEditDish = (item: MenuItem) => {
    setEditingItem({ ...item });
    setVariantsInput(item.variants ? item.variants.join(', ') : '');
  };

  const handleSaveDishModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) return;
    const parsedVariants = variantsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onSaveMenuItem({
      ...editingItem,
      name: editingItem.name.trim().toUpperCase(),
      price: Number(editingItem.price) || 0,
      variants: parsedVariants.length > 0 ? parsedVariants : undefined,
    });
    setEditingItem(null);
  };

  const handleUpdateDailySpecial = async () => {
    await onSaveSettings({ dailySpecialDescription: dailySpecialNote });
    setSavedDailyBanner(true);
    setTimeout(() => setSavedDailyBanner(false), 2000);
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      sinpeNumber: sinpeInput.trim(),
      serviceChargePercent: Number(servicePercentInput),
      expressDeliveryFee: Number(expressFeeInput),
      expressRadiusKm: Number(radiusInput),
    });
    setSavedSettingsMsg(true);
    setTimeout(() => setSavedSettingsMsg(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Admin Header & Sub-Navigation (Hidden when printing QR codes) */}
      <div className="no-print bg-white border border-stone-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">
            Panel Administrativo — {settings.restaurantName}
          </h1>
          <p className="text-sm text-stone-600 mt-0.5">
            Genera códigos QR por mesa, edita platillos y el Plato del Día, y consulta el cierre de ventas.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSubTab('qr')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'qr'
                ? 'bg-[#C81E1E] text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Mesas y Códigos QR
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('menu')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'menu'
                ? 'bg-[#C81E1E] text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <Utensils className="w-4 h-4" />
            Menú y Plato del Día
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('sales')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'sales'
                ? 'bg-[#C81E1E] text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Ventas y Tarifas
          </button>
          <button type="button" onClick={() => setActiveSubTab('pos')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeSubTab==='pos'?'bg-[#C81E1E] text-white':'text-stone-700'}`}>Punto de venta</button>
          <button type="button" onClick={() => setActiveSubTab('pedidos')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeSubTab==='pedidos'?'bg-[#C81E1E] text-white':'text-stone-700'}`}>Autorizar y cocina</button>
          <button type="button" onClick={() => setActiveSubTab('caja')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeSubTab==='caja'?'bg-[#C81E1E] text-white':'text-stone-700'}`}>Caja / Mesas</button>
          <button type="button" onClick={() => setActiveSubTab('expres')} className={`px-4 py-2 rounded-lg font-bold text-sm ${activeSubTab==='expres'?'bg-[#C81E1E] text-white':'text-stone-700'}`}>Horario exprés</button>
        </div>
      </div>

      {activeSubTab === 'pos' && <AdminPOSView menu={menu} tables={tables} onCreate={onCreatePOS} />}
      {activeSubTab === 'pedidos' && <ReceptionView orders={orders} settings={settings} onUpdateOrder={onUpdateOrder}/>}
      {activeSubTab === 'caja' && <AdminCashierView orders={orders} onCheckout={onCheckout}/>}
      {activeSubTab === 'expres' && <ExpressScheduleSettings settings={settings} onSaveSettings={onSaveSettings}/>}
      {/* Inventario en pausa por decisión del negocio. No se muestra ni descuenta stock. */}
      {/* SUB-VIEW 1: QR CODES & TABLES */}
      {activeSubTab === 'qr' && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="no-print bg-white border border-stone-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <form onSubmit={handleAddTable} className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Nombre ej. Mesa 9 o Terraza 2"
                className="px-3.5 py-2 border border-stone-200 rounded-xl text-sm w-56"
              />
              <input
                type="number"
                min={1}
                max={20}
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                className="px-3 py-2 border border-stone-200 rounded-xl text-sm w-24 font-mono"
                title="Capacidad de personas"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agregar Mesa
              </button>
            </form>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 bg-[#C81E1E] hover:bg-[#A91919] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Códigos QR de Mesas
              </button>
            </div>
          </div>

          <div className="no-print rounded-xl border bg-white p-4 overflow-x-auto"><h2 className="font-bold mb-2">Editar mesas</h2>{tables.map(table => <form key={table.id + table.name + table.capacity} className="flex flex-wrap gap-2 mb-2 items-center" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); await onSaveTables(tables.map(t => t.id === table.id ? {...t, name:String(data.get('name')), capacity:Number(data.get('capacity'))} : t)); }}><span className="text-xs">Mesa {table.number}</span><input aria-label={'Nombre de mesa ' + table.number} name="name" defaultValue={table.name} required maxLength={100} className="border rounded p-2"/><input aria-label={'Capacidad de mesa ' + table.number} name="capacity" type="number" min={1} max={100} defaultValue={table.capacity} required className="border rounded p-2 w-20"/><button className="bg-stone-900 text-white rounded p-2 text-xs">Guardar mesa</button></form>)}</div>
          {/* Printable Grid of Table QR Cards + Express QR Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {tables.map((table) => {
              const qrImg = qrDataUrls[table.id];
              const tableUrl = `${baseUrl}/mesa?qr=${encodeURIComponent(table.qrToken || "")}`;

              return (
                <div
                  key={table.id}
                  className="bg-white border-2 border-stone-200 rounded-2xl p-5 flex flex-col items-center text-center justify-between shadow-2xs break-inside-avoid"
                >
                  <div className="w-full">
                    <div className="bg-[#C81E1E] text-white py-2.5 px-3 rounded-xl mb-3 flex items-center justify-center gap-2.5">
                      <img
                        src={LOGO_URL}
                        alt="Pollos Karen"
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full bg-white p-0.5 object-contain shrink-0"
                      />
                      <div className="text-left">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-red-100 leading-tight">
                          Pollos Karen
                        </div>
                        <div className="font-display text-lg font-extrabold leading-tight">
                          {table.name}
                        </div>
                      </div>
                    </div>

                    {qrImg ? (
                      <img
                        src={qrImg}
                        alt={`QR ${table.name}`}
                        referrerPolicy="no-referrer"
                        className="w-44 h-44 mx-auto rounded-xl border border-stone-200 p-1 bg-white"
                      />
                    ) : (
                      <div className="w-44 h-44 mx-auto rounded-xl bg-stone-100 flex items-center justify-center text-xs text-stone-400">
                        Generando QR...
                      </div>
                    )}

                    <p className="text-xs font-semibold text-stone-800 mt-3">
                      Escanea con tu cámara para ver el menú y pedir desde tu mesa
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Pago en caja · +{settings.serviceChargePercent}% servicio en restaurante
                    </p>
                  </div>

                  {/* Interactive Actions (Hidden on print) */}
                  <div className="no-print w-full mt-4 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSimulateScanTable(table.id)}
                      className="flex-1 py-2 px-3 rounded-lg bg-stone-900 hover:bg-[#C81E1E] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Probar Mesa
                    </button>

                    <button type="button" title="Revocar QR anterior y generar uno nuevo" className="border rounded p-2 text-xs" onClick={async () => { if (window.confirm('¿Regenerar QR? El enlace anterior dejará de funcionar.')) { await api('/api/tables/' + table.id + '/rotate','POST',{}); location.reload(); } }}>Regenerar QR</button>
                    <button type="button" className="border rounded p-2 text-xs" onClick={() => onSaveTables(tables.map(t => t.id === table.id ? {...t,active:!t.active} : t))}>{table.active ? 'Desactivar' : 'Activar'}</button>
                    {qrImg && (
                      <a
                        href={qrImg}
                        download={`QR-${table.name.replace(/\s+/g, '-')}.png`}
                        title="Descargar imagen QR"
                        className="p-2 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-100"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteTable(table.id)}
                      title={`Eliminar ${table.name} (${tableUrl})`}
                      className="p-2 rounded-lg border border-stone-200 text-stone-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Dedicated QR Card for Express Delivery (<= 1 km) */}
            <div className="bg-red-50/50 border-2 border-[#C81E1E]/40 rounded-2xl p-5 flex flex-col items-center text-center justify-between break-inside-avoid">
              <div className="w-full">
                <div className="bg-stone-900 text-white py-2 px-3 rounded-xl mb-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                    Pedidos a Domicilio (≤ {settings.expressRadiusKm} km)
                  </div>
                  <div className="font-display text-xl font-extrabold">
                    QR Servicio Exprés
                  </div>
                </div>

                {expressQrUrl && (
                  <img
                    src={expressQrUrl}
                    alt="QR Servicio Exprés"
                    referrerPolicy="no-referrer"
                    className="w-44 h-44 mx-auto rounded-xl border border-stone-200 p-1 bg-white"
                  />
                )}

                <p className="text-xs font-semibold text-stone-800 mt-3">
                  Comparte este QR en redes ({settings.facebookHandle}) para pedidos Exprés
                </p>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  SINPE {settings.sinpeNumber} con captura o Efectivo · +{formatColones(settings.expressDeliveryFee)}
                </p>
              </div>

              <div className="no-print w-full mt-4 pt-3 border-t border-red-200/60 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSimulateExpress}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#C81E1E] hover:bg-[#A91919] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Bike className="w-3.5 h-3.5" />
                  Probar Vista Exprés
                </button>
                {expressQrUrl && (
                  <a
                    href={expressQrUrl}
                    download="QR-Servicio-Expres-Pollo-Karen.png"
                    className="p-2 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-100"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: MENU & PLATO DEL DÍA EDITOR */}
      {activeSubTab === 'menu' && (
        <div className="space-y-6">
          {/* Quick Editor for Plato del Día */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#C81E1E]" />
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Configuración Rápida del Plato del Día (₡2.500 con té frío)
                </h2>
              </div>
              {savedDailyBanner && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Actualizado en el menú digital
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={dailySpecialNote}
                onChange={(e) => setDailySpecialNote(e.target.value)}
                placeholder="Ej. Hoy: Pollo en salsa blanca o Costilla de cerdo con arroz, frijoles, ensalada y té frío"
                className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={handleUpdateDailySpecial}
                className="px-5 py-2.5 bg-[#C81E1E] hover:bg-[#A91919] text-white font-bold text-xs sm:text-sm rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                Actualizar Plato del Día
              </button>
            </div>
          </div>

          {/* Menu Catalog Table */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Catálogo de Platillos ({menu.length} productos)
                </h2>
                <p className="text-xs text-stone-500">
                  Cambia precios, opciones o marca un platillo como agotado en tiempo real.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartCreateDish}
                className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo Platillo
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-bold text-stone-500 uppercase">
                    <th className="py-3 px-4">Platillo</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Variantes / Opciones</th>
                    <th className="py-3 px-4 text-right">Precio</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {menu.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/80">
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-stone-500">{item.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-stone-600">
                        {CATEGORY_META[item.category]?.title || item.category}
                      </td>
                      <td className="py-3 px-4 text-xs text-stone-600">
                        {item.variants && item.variants.length > 0
                          ? item.variants.join(' · ')
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#C81E1E] tabular-nums">
                        {formatColones(item.price)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            onSaveMenuItem({ ...item, available: !item.available })
                          }
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            item.available
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border border-stone-200'
                          }`}
                        >
                          {item.available ? 'Disponible' : 'Agotado'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditDish(item)}
                            className="p-2 rounded-lg text-stone-600 hover:bg-stone-100"
                            title="Editar platillo"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (window.confirm("¿Eliminar este platillo del catálogo?")) onDeleteMenuItem(item.id); }}
                            className="p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50"
                            title="Eliminar platillo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: SALES SUMMARY & SETTINGS */}
      {activeSubTab === 'sales' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 items-center"><label>Período <select className="border p-2 rounded" value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="week">Últimos 7 días</option><option value="month">Mes actual</option><option value="custom">Rango personalizado</option></select></label>
          {period === 'custom' && <><label>Desde <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta <input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label></>}
          <span className="text-xs">America/Costa_Rica · Cobros por fecha de pago</span></div>
          <div className="bg-white border rounded p-4 text-sm">{salesMetrics.totalOrders} pedidos creados · {salesMetrics.paidCount} cobros · {salesMetrics.pendingCount} pendientes ({formatColones(salesMetrics.pendingTotal)}) · {salesMetrics.cancelledCount} cancelados</div>
          <div className="bg-white border rounded-xl p-4 flex justify-between items-center gap-4">
            <div><strong>Ventas por ventana</strong><p className="text-sm text-stone-600">{salesMetrics.windowCount} ventas cobradas, sin 10% ni tarifa de envío</p></div>
            <strong className="text-xl text-red-700">{formatColones(salesMetrics.windowRevenue)}</strong>
          </div>
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <span className="text-xs font-semibold text-stone-500">
                Ventas cobradas
              </span>
              <div className="font-mono text-2xl font-extrabold text-stone-900 mt-1 tabular-nums">
                {formatColones(salesMetrics.totalRevenue)}
              </div>
              <span className="text-xs text-stone-500 mt-1 block">
                {salesMetrics.paidCount} pagos recibidos
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <span className="text-xs font-semibold text-stone-500">
                Ventas en Mesas (+10% Servicio)
              </span>
              <div className="font-mono text-2xl font-extrabold text-stone-900 mt-1 tabular-nums">
                {formatColones(salesMetrics.dineInRevenue)}
              </div>
              <span className="text-xs text-emerald-700 font-medium mt-1 block">
                {salesMetrics.dineInCount} órdenes · 10% Servicio:{' '}
                {formatColones(salesMetrics.totalServiceCharge)}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <span className="text-xs font-semibold text-stone-500">
                Ventas Servicio Exprés (≤ 1 km)
              </span>
              <div className="font-mono text-2xl font-extrabold text-[#C81E1E] mt-1 tabular-nums">
                {formatColones(salesMetrics.expressRevenue)}
              </div>
              <span className="text-xs text-stone-600 mt-1 block">
                {salesMetrics.expressCount} órdenes · Envíos:{' '}
                {formatColones(salesMetrics.totalDeliveryFees)}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-1">
              <span className="text-xs font-semibold text-stone-500">
                Desglose por Método de Pago
              </span>
              <div className="text-xs flex justify-between pt-1">
                <span>SINPE Móvil ({settings.sinpeNumber}):</span>
                <strong className="font-mono">{formatColones(salesMetrics.bySinpe)}</strong>
              </div>
              <div className="text-xs flex justify-between">
                <span>Efectivo:</span>
                <strong className="font-mono">{formatColones(salesMetrics.byCash)}</strong>
              </div>
              <div className="text-xs flex justify-between">
                <span>Tarjeta en Caja:</span>
                <strong className="font-mono">{formatColones(salesMetrics.byCard)}</strong>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto bg-white border rounded-xl p-4"><h2 className="font-bold mb-3">Historial de pedidos por fecha de creación</h2><table className="w-full text-sm text-left"><thead><tr><th>Pedido</th><th>Fecha CR</th><th>Estado</th><th>Pago</th><th>Total</th></tr></thead><tbody>{salesMetrics.history.map(o => <tr key={o.id} className="border-t"><td className="p-2">#{o.orderNumber}</td><td>{costaRicaDate(o.createdAt)}</td><td>{o.status}</td><td>{o.isPaid ? 'Pagado' : 'Pendiente'}</td><td>{formatColones(o.total)}</td></tr>)}</tbody></table></div>
          <StaffAccounts/>
          {/* Tarifas & Restaurant Configuration */}
          <form
            onSubmit={handleSaveGeneralSettings}
            className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 max-w-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#C81E1E]" />
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Parámetros de Cobro, SINPE y Servicio Exprés
                </h2>
              </div>
              {savedSettingsMsg && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Cambios guardados
                </span>
              )}
            </div>

            <label className="block text-xs font-bold">Radio habitual de entrega (km)<input type="number" min={0.1} max={100} step={0.1} value={radiusInput} onChange={e=>setRadiusInput(Number(e.target.value))} className="block border rounded p-2 mt-1"/></label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Número SINPE Móvil Oficial
                </label>
                <input
                  type="text"
                  value={sinpeInput}
                  onChange={(e) => setSinpeInput(e.target.value)}
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  % Servicio en Mesa (Salón)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  disabled
                  value={servicePercentInput}
                  onChange={(e) => setServicePercentInput(Number(e.target.value))}
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Tarifa Exprés (1 km) en ₡
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={expressFeeInput}
                  onChange={(e) => setExpressFeeInput(Number(e.target.value))}
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
            >
              Guardar Configuración
            </button>
          </form>
        </div>
      )}

      {/* Dish Create/Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveDishModal}
            className="bg-white rounded-2xl max-w-md w-full p-6 border border-stone-200 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-stone-900">
                Guardar Platillo del Menú
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Nombre del platillo *
              </label>
              <input
                type="text"
                required
                value={editingItem.name}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, name: e.target.value })
                }
                placeholder="Ej. CASADO CON CHULETA"
                className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Categoría
                </label>
                <select
                  value={editingItem.category}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      category: e.target.value as CategoryId,
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm bg-white"
                >
                  {Object.entries(CATEGORY_META).map(([id, meta]) => (
                    <option key={id} value={id}>
                      {meta.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Precio en Colones (₡) *
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  step={50}
                  value={editingItem.price}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      price: Number(e.target.value),
                    })
                  }
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Descripción / Acompañamientos
              </label>
              <input
                type="text"
                value={editingItem.description || ''}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, description: e.target.value })
                }
                placeholder="Ej. Arroz - Frijoles - Ensalada - Picadillo · Con té frío"
                className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Opciones / Variantes (separadas por coma)
              </label>
              <input
                type="text"
                value={variantsInput}
                onChange={(e) => setVariantsInput(e.target.value)}
                placeholder="Ej. Pollo, Carne (dejar vacío si no aplica)"
                className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#C81E1E] hover:bg-[#A91919] text-white text-xs font-bold cursor-pointer"
              >
                Guardar Platillo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

function ExpressScheduleSettings({settings,onSaveSettings}:{settings:RestaurantSettings;onSaveSettings:(changes:Partial<RestaurantSettings>)=>Promise<void>}) {
  const [open,setOpen]=React.useState(settings.expressOpen||"07:00");
  const [close,setClose]=React.useState(settings.expressClose||"16:00");
  const [days,setDays]=React.useState<number[]>(settings.expressDays||[1,2,3,4,5]);
  const [temporarilyClosed,setTemporarilyClosed]=React.useState(!!settings.expressTemporarilyClosed);
  const [message,setMessage]=React.useState("");
  return <form className="bg-white border rounded-2xl p-6 space-y-4 max-w-xl" onSubmit={async e=>{e.preventDefault();try{await onSaveSettings({expressOpen:open,expressClose:close,expressDays:days,expressTemporarilyClosed:temporarilyClosed});setMessage("Horario exprés guardado.");}catch(e){setMessage(e instanceof Error?e.message:"No se guardaron los cambios.");}}}>
    <h2 className="font-bold text-xl">Horario del servicio exprés</h2><p className="text-sm">Predeterminado: lunes a viernes, 7:00 a.m. a 4:00 p.m., zona horaria Costa Rica. Fuera de horario no se reciben pedidos nuevos, pero sí continúan los anteriores.</p>
    <div className="flex gap-3"><label>Apertura<input className="block border rounded-lg p-2" type="time" value={open} onChange={e=>setOpen(e.target.value)} required/></label><label>Cierre<input className="block border rounded-lg p-2" type="time" value={close} onChange={e=>setClose(e.target.value)} required/></label></div>
    <fieldset><legend className="font-semibold">Días habilitados</legend><div className="flex flex-wrap gap-3 mt-2">{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((name,day)=><label key={day} className="flex gap-1 items-center text-sm"><input type="checkbox" checked={days.includes(day)} onChange={e=>setDays(old=>e.target.checked?[...old,day].sort():old.filter(d=>d!==day))}/>{name}</label>)}</div></fieldset>
    <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={temporarilyClosed} onChange={e=>setTemporarilyClosed(e.target.checked)}/>Cerrar exprés temporalmente (feriados, emergencias)</label>
    <button className="bg-red-700 text-white font-bold rounded-lg px-5 py-3">Guardar horario</button>{message&&<p role="status">{message}</p>}
  </form>;
}
