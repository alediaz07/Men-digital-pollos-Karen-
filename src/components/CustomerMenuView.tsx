import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Check,
  Copy,
  Upload,
  MapPin,
  Utensils,
  Bike,
  Clock,
  Phone,
  Search,
  ChevronRight,
  CheckCircle2,
  ChefHat,
  Sparkles,
  X,
  FileImage,
  AlertCircle,
} from 'lucide-react';
import {
  CategoryId,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  RestaurantSettings,
  RestaurantTable,
} from '../types';
import { CATEGORY_META, LOGO_URL } from '../data/initialData';
import { compressReceiptImage, formatColones, getElapsedMinutes } from '../utils/format';

interface CustomerMenuViewProps {
  menu: MenuItem[];
  tables: RestaurantTable[];
  settings: RestaurantSettings;
  orders: Order[];
  selectedTableId: string | null;
  initialMode: OrderType;
  onSelectTable: (tableId: string | null) => void;
  onSelectMode: (mode: OrderType) => void;
  onSubmitOrder: (orderPayload: Partial<Order>) => Promise<Order>;
}

const CATEGORY_ORDER: CategoryId[] = [
  CategoryId.PLATO_DEL_DIA,
  CategoryId.DESAYUNOS,
  CategoryId.CASADOS,
  CategoryId.COMIDA_RAPIDA,
  CategoryId.REFRESCOS,
];

export const CustomerMenuView: React.FC<CustomerMenuViewProps> = ({
  menu,
  tables,
  settings,
  orders,
  selectedTableId,
  initialMode,
  onSelectTable,
  onSelectMode,
  onSubmitOrder,
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Item customization modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [itemNotes, setItemNotes] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);

  // Dine-in vs Express checkout state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [withinOneKmConfirmed, setWithinOneKmConfirmed] = useState(false);
  const [expressPaymentMethod, setExpressPaymentMethod] = useState<
    PaymentMethod.SINPE | PaymentMethod.EFECTIVO
  >(PaymentMethod.SINPE);
  const [sinpeReference, setSinpeReference] = useState('');
  const [sinpeReceiptImage, setSinpeReceiptImage] = useState<string>('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [cashChangeFor, setCashChangeFor] = useState<string>('');
  const [copiedSinpe, setCopiedSinpe] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track customer's submitted order IDs in localStorage so they see real-time status
  const [myOrderIds, setMyOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('karen_my_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const activeTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) || tables[0] || null,
    [tables, selectedTableId]
  );

  const myActiveOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        myOrderIds.includes(o.id) &&
        o.status !== OrderStatus.DELIVERED &&
        o.status !== OrderStatus.CANCELLED
    );
  }, [orders, myOrderIds]);

  const platoDelDia = useMemo(
    () => menu.find((m) => m.category === CategoryId.PLATO_DEL_DIA && m.available),
    [menu]
  );

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchesCategory =
        activeCategory === 'all' || item.category === activeCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [menu, activeCategory, searchQuery]);

  // Cart totals
  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [cart]
  );

  const serviceFee = useMemo(
    () =>
      initialMode === OrderType.DINE_IN
        ? Math.round(subtotal * (settings.serviceChargePercent / 100))
        : 0,
    [subtotal, initialMode, settings.serviceChargePercent]
  );

  const deliveryFee = useMemo(
    () => (initialMode === OrderType.EXPRESS && cart.length > 0 ? settings.expressDeliveryFee : 0),
    [initialMode, cart.length, settings.expressDeliveryFee]
  );

  const totalAmount = subtotal + serviceFee + deliveryFee;

  const totalCartItems = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  const handleOpenItemModal = (item: MenuItem) => {
    if (!item.available) return;
    setCustomizingItem(item);
    setSelectedVariant(item.variants && item.variants.length > 0 ? item.variants[0] : '');
    setItemNotes('');
    setItemQuantity(1);
  };

  const handleConfirmAddToCart = () => {
    if (!customizingItem) return;
    const variantKey = selectedVariant.trim();
    const notesKey = itemNotes.trim();

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) =>
          i.menuItemId === customizingItem.id &&
          (i.selectedVariant || '') === variantKey &&
          (i.notes || '') === notesKey
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + itemQuantity,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          menuItemId: customizingItem.id,
          name: customizingItem.name,
          price: customizingItem.price,
          quantity: itemQuantity,
          selectedVariant: variantKey || undefined,
          notes: notesKey || undefined,
        },
      ];
    });

    setCustomizingItem(null);
  };

  const updateCartQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === cartItemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleCopySinpe = () => {
    navigator.clipboard?.writeText(settings.sinpeNumber.replace(/[^0-9]/g, ''));
    setCopiedSinpe(true);
    setTimeout(() => setCopiedSinpe(false), 2000);
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCheckoutError(null);
    setIsUploadingReceipt(true);
    try {
      const compressed = await compressReceiptImage(file);
      setSinpeReceiptImage(compressed);
    } catch {
      setCheckoutError('No se pudo procesar la imagen del comprobante. Intenta con otra captura.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('Tu pedido está vacío. Agrega al menos un platillo del menú.');
      return;
    }

    if (initialMode === OrderType.DINE_IN) {
      if (!activeTable) {
        setCheckoutError('Por favor selecciona el número de tu mesa.');
        return;
      }
    } else {
      // Express validation (<= 1 km radius + payment method + SINPE screenshot)
      if (!customerName.trim()) {
        setCheckoutError('Por favor ingresa tu nombre para el pedido exprés.');
        return;
      }
      if (!customerPhone.trim()) {
        setCheckoutError('Por favor ingresa tu número de teléfono / WhatsApp.');
        return;
      }
      if (!deliveryAddress.trim()) {
        setCheckoutError('Por favor escribe tu dirección exacta y señas.');
        return;
      }
      if (!withinOneKmConfirmed) {
        setCheckoutError(
          `El Servicio Exprés aplica únicamente hasta ${settings.expressRadiusKm} km a la redonda. Confirma la casilla de cobertura.`
        );
        return;
      }
      if (expressPaymentMethod === PaymentMethod.SINPE && !sinpeReceiptImage) {
        setCheckoutError(
          'Por favor adjunta la captura de pantalla del comprobante de SINPE Móvil para enviar tu pedido exprés.'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const created = await onSubmitOrder({
        orderType: initialMode,
        tableId: initialMode === OrderType.DINE_IN ? activeTable?.id : undefined,
        tableName: initialMode === OrderType.DINE_IN ? activeTable?.name : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone:
          initialMode === OrderType.EXPRESS ? customerPhone.trim() : undefined,
        deliveryAddress:
          initialMode === OrderType.EXPRESS ? deliveryAddress.trim() : undefined,
        withinOneKmConfirmed:
          initialMode === OrderType.EXPRESS ? withinOneKmConfirmed : undefined,
        items: cart,
        paymentMethod:
          initialMode === OrderType.DINE_IN
            ? PaymentMethod.PENDING_CAJA
            : expressPaymentMethod,
        sinpeReference:
          initialMode === OrderType.EXPRESS && expressPaymentMethod === PaymentMethod.SINPE
            ? sinpeReference.trim() || undefined
            : undefined,
        sinpeReceiptImage:
          initialMode === OrderType.EXPRESS && expressPaymentMethod === PaymentMethod.SINPE
            ? sinpeReceiptImage
            : undefined,
        cashChangeFor:
          initialMode === OrderType.EXPRESS &&
          expressPaymentMethod === PaymentMethod.EFECTIVO &&
          cashChangeFor
            ? Number(cashChangeFor)
            : undefined,
        isPaid: false,
      });

      const updatedIds = [created.id, ...myOrderIds];
      setMyOrderIds(updatedIds);
      try {
        localStorage.setItem('karen_my_orders', JSON.stringify(updatedIds));
      } catch {
        // ignore storage errors
      }

      // Reset cart and close drawer
      setCart([]);
      setSinpeReceiptImage('');
      setSinpeReference('');
      setCashChangeFor('');
      setIsCartOpen(false);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Error al enviar el pedido. Intenta de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-28">
      {/* Restaurant Hero Header inspired by the original Pollo Cervecero Karen menu */}
      <section className="bg-[#C81E1E] text-white border-b border-[#991B1B]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <img
                src={LOGO_URL}
                alt="Logo Pollos Karen"
                referrerPolicy="no-referrer"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white p-1 object-contain shadow-md shrink-0"
              />
              <div>
                <div className="flex items-center gap-3 text-xs font-medium text-red-100 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {settings.scheduleText}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{settings.facebookHandle}</span>
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Pollos Karen
                </h1>
                <p className="text-sm sm:text-base text-red-100 mt-1 max-w-xl">
                  Desayunos tradicionales, casados con té frío, comida rápida y nuestro Plato del Día recién hecho.
                </p>
              </div>
            </div>

            {/* Mode Switcher: En Mesa (QR) vs Servicio Exprés (1 km) */}
            <div className="bg-[#991B1B]/70 p-2 rounded-2xl border border-red-400/30 flex flex-col gap-2.5 sm:min-w-[330px]">
              <div className="grid grid-cols-2 gap-1.5 bg-[#7F1D1D] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => onSelectMode(OrderType.DINE_IN)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                    initialMode === OrderType.DINE_IN
                      ? 'bg-white text-[#C81E1E] shadow-sm'
                      : 'text-red-100 hover:text-white'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  En Mesa (QR)
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMode(OrderType.EXPRESS)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                    initialMode === OrderType.EXPRESS
                      ? 'bg-white text-[#C81E1E] shadow-sm'
                      : 'text-red-100 hover:text-white'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  Exprés (≤ {settings.expressRadiusKm} km)
                </button>
              </div>

              {initialMode === OrderType.DINE_IN ? (
                <div className="flex items-center justify-between gap-3 px-2 py-1 text-xs text-red-50">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>Ubicación activa:</span>
                  </div>
                  <select
                    aria-label="Seleccionar mesa"
                    value={activeTable?.id || ''}
                    onChange={(e) => onSelectTable(e.target.value)}
                    className="bg-white/15 hover:bg-white/25 text-white font-semibold rounded-lg px-2.5 py-1 text-xs border border-white/25 focus:outline-none"
                  >
                    {tables
                      .filter((t) => t.active)
                      .map((t) => (
                        <option key={t.id} value={t.id} className="text-stone-900">
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-amber-200">
                  <span>Cobertura exclusiva: {settings.expressRadiusKm} km a la redonda</span>
                  <span className="font-mono font-semibold">
                    +{formatColones(settings.expressDeliveryFee)} envío
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active Order Live Status Tracker (when customer has placed an order) */}
      {myActiveOrders.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-5">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-[#C81E1E]" />
                <h2 className="text-base font-bold text-stone-900">
                  Seguimiento de tu pedido en vivo
                </h2>
              </div>
              <span className="text-xs text-stone-500">
                Actualización en tiempo real
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myActiveOrders.map((ord) => {
                const isReception = ord.status === OrderStatus.PENDING_RECEPTION;
                const isKitchen = ord.status === OrderStatus.IN_KITCHEN;
                const isReady = ord.status === OrderStatus.READY;

                return (
                  <div
                    key={ord.id}
                    className="border border-stone-200 rounded-xl p-3.5 bg-[#FAF8F5]"
                  >
                    <div className="flex items-center justify-between text-xs text-stone-600 mb-2">
                      <span className="font-mono font-bold text-stone-900">
                        Orden #{ord.orderNumber} ·{' '}
                        {ord.orderType === OrderType.DINE_IN
                          ? ord.tableName
                          : 'Servicio Exprés'}
                      </span>
                      <span>{getElapsedMinutes(ord.createdAt)}</span>
                    </div>

                    {/* Step Progress Bar */}
                    <div className="grid grid-cols-3 gap-2 my-2.5">
                      <div
                        className={`rounded-lg p-2 text-center border text-xs font-medium ${
                          isReception
                            ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        1. En Recepción
                      </div>
                      <div
                        className={`rounded-lg p-2 text-center border text-xs font-medium ${
                          isKitchen
                            ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold'
                            : isReady
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-stone-100 border-stone-200 text-stone-400'
                        }`}
                      >
                        2. En Cocina
                      </div>
                      <div
                        className={`rounded-lg p-2 text-center border text-xs font-medium ${
                          isReady
                            ? 'bg-emerald-600 border-emerald-600 text-white font-semibold'
                            : 'bg-stone-100 border-stone-200 text-stone-400'
                        }`}
                      >
                        3. ¡Listo!
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-stone-600 pt-1 border-t border-stone-200/80">
                      <span>
                        {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                      </span>
                      <span className="font-mono font-bold text-stone-900 ml-2 shrink-0">
                        {formatColones(ord.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Featured Plato del Día Banner + Search + Category Filter Tabs */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {platoDelDia && activeCategory === 'all' && !searchQuery && (
          <div className="mb-6 bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#C81E1E]">
                <Sparkles className="w-4 h-4" />
                <span>ESPECIALIDAD DEL DÍA · CON TÉ FRÍO INCLUIDO</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-stone-900">
                {platoDelDia.name} —{' '}
                <span className="font-mono text-[#C81E1E]">
                  {formatColones(platoDelDia.price)}
                </span>
              </h2>
              <p className="text-sm text-stone-600">
                {settings.dailySpecialDescription || platoDelDia.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenItemModal(platoDelDia)}
              className="px-5 py-3 bg-[#C81E1E] hover:bg-[#A91919] text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Pedir Plato del Día
            </button>
          </div>
        )}

        {/* Search & Interactive Category Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-[#1C1917] text-white'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              Todo el Menú
            </button>
            {CATEGORY_ORDER.map((catId) => (
              <button
                key={catId}
                type="button"
                onClick={() => setActiveCategory(catId)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === catId
                    ? 'bg-[#C81E1E] text-white'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                {CATEGORY_META[catId].title}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar casado, pinto, alitas..."
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#C81E1E]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Menu Sections Grouped by Official Categories */}
        <div className="space-y-10">
          {CATEGORY_ORDER.map((catId) => {
            const categoryItems = filteredMenu.filter((m) => m.category === catId);
            if (categoryItems.length === 0) return null;
            const meta = CATEGORY_META[catId];

            return (
              <section key={catId} className="space-y-4">
                {/* Red Category Banner inspired by the physical menu */}
                <div className="bg-[#C81E1E] text-white rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wide">
                    {meta.title}
                  </h2>
                  <span className="text-xs sm:text-sm text-red-100 italic">
                    {meta.subtitle}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryItems.map((item) => {
                    const inCartCount = cart
                      .filter((c) => c.menuItemId === item.id)
                      .reduce((sum, c) => sum + c.quantity, 0);

                    return (
                      <div
                        key={item.id}
                        onClick={() => item.available && handleOpenItemModal(item)}
                        className={`bg-white border rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all ${
                          item.available
                            ? 'border-stone-200 hover:border-[#C81E1E]/60 hover:-translate-y-0.5 cursor-pointer'
                            : 'border-stone-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-base font-bold text-stone-900 leading-snug">
                              {item.name}
                            </h3>
                            <span className="font-mono text-base sm:text-lg font-bold text-[#C81E1E] tabular-nums shrink-0">
                              {formatColones(item.price)}
                            </span>
                          </div>

                          {item.description && (
                            <p className="text-xs sm:text-sm text-[#B91C1C] mt-1.5 leading-relaxed">
                              {item.description}
                            </p>
                          )}

                          {item.variants && item.variants.length > 0 && (
                            <p className="text-xs text-stone-500 mt-2">
                              Opciones: {item.variants.join(' · ')}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                          <span className="text-xs text-stone-500">
                            {item.available
                              ? item.scheduleText || 'Disponible ahora'
                              : 'Agotado temporalmente'}
                          </span>

                          {item.available ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenItemModal(item);
                              }}
                              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                                inCartCount > 0
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-stone-900 hover:bg-[#C81E1E] text-white'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {inCartCount > 0 ? `En pedido (${inCartCount})` : 'Agregar'}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-stone-400">
                              No disponible
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Bottom Restaurant Info Footer */}
        <footer className="mt-12 pt-6 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-600">
          <div className="flex items-center gap-3">
            <span className="font-bold text-stone-900">
              SINPE Móvil: {settings.sinpeNumber}
            </span>
            <span aria-hidden="true">·</span>
            <span>{settings.facebookHandle}</span>
          </div>
          <div>
            {initialMode === OrderType.DINE_IN ? (
              <span>
                Todo precio es sujeto a +{settings.serviceChargePercent}% de servicio en restaurante · Pago en caja
              </span>
            ) : (
              <span>
                Servicio Exprés únicamente hasta {settings.expressRadiusKm} km a la redonda · Tarifa{' '}
                {formatColones(settings.expressDeliveryFee)}
              </span>
            )}
          </div>
        </footer>
      </div>

      {/* Item Customization Modal (Variants & Kitchen Notes) */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 border border-stone-200 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-[#C81E1E]">
                  {CATEGORY_META[customizingItem.category].title}
                </span>
                <h3 className="font-display text-xl font-bold text-stone-900 mt-0.5">
                  {customizingItem.name}
                </h3>
                <p className="font-mono text-base font-bold text-stone-800 mt-1">
                  {formatColones(customizingItem.price)} c/u
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {customizingItem.variants && customizingItem.variants.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700">
                  Selecciona una opción:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {customizingItem.variants.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setSelectedVariant(variant)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border text-left transition-all flex items-center justify-between ${
                        selectedVariant === variant
                          ? 'bg-red-50 border-[#C81E1E] text-[#C81E1E]'
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <span>{variant}</span>
                      {selectedVariant === variant && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-700">
                Notas para cocina (opcional):
              </label>
              <input
                type="text"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="Ej. Sin ensalada, sin picadillo, salsas aparte..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#C81E1E]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3 bg-stone-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-lg bg-white text-stone-800 flex items-center justify-center shadow-2xs"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-mono font-bold text-base w-6 text-center tabular-nums">
                  {itemQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => setItemQuantity((q) => q + 1)}
                  className="w-10 h-10 rounded-lg bg-white text-stone-800 flex items-center justify-center shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmAddToCart}
                className="flex-1 ml-4 h-12 bg-[#C81E1E] hover:bg-[#A91919] text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Agregar al pedido</span>
                <span className="font-mono">
                  {formatColones(customizingItem.price * itemQuantity)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Cart Bar (<= 15% mobile sticky height) */}
      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 sm:p-4 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5] to-transparent">
          <div className="max-w-3xl mx-auto">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="w-full h-14 px-5 rounded-2xl bg-[#1C1917] hover:bg-stone-800 text-white shadow-lg flex items-center justify-between transition-transform active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#C81E1E] flex items-center justify-center font-mono font-bold text-sm">
                  {totalCartItems}
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold">
                    {initialMode === OrderType.DINE_IN
                      ? `Ver pedido · ${activeTable?.name || 'Mesa'}`
                      : 'Ver pedido · Servicio Exprés'}
                  </div>
                  <div className="text-[11px] text-stone-300">
                    {initialMode === OrderType.DINE_IN
                      ? `Incluye +${settings.serviceChargePercent}% servicio · Pago en caja`
                      : `Incluye +${formatColones(settings.expressDeliveryFee)} tarifa exprés`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold tabular-nums">
                  {formatColones(totalAmount)}
                </span>
                <ChevronRight className="w-5 h-5 text-stone-400" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Cart & Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full flex flex-col justify-between overflow-hidden shadow-2xl">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-[#C81E1E]" />
                <div>
                  <h2 className="font-display text-lg font-bold text-stone-900">
                    Confirmar Pedido
                  </h2>
                  <p className="text-xs text-stone-500">
                    {initialMode === OrderType.DINE_IN
                      ? `${activeTable?.name || 'En Mesa'} · Pago directo en Caja`
                      : `Servicio Exprés (Máx. ${settings.expressRadiusKm} km a la redonda)`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-9 h-9 rounded-full bg-stone-200/70 hover:bg-stone-200 flex items-center justify-center text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <form
              id="checkout-form"
              onSubmit={handlePlaceOrder}
              className="flex-1 overflow-y-auto p-5 space-y-6"
            >
              {/* Mode Switch inside Checkout */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    onSelectMode(OrderType.DINE_IN);
                    setCheckoutError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    initialMode === OrderType.DINE_IN
                      ? 'bg-white text-stone-900 shadow-2xs'
                      : 'text-stone-600'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  En Mesa (+{settings.serviceChargePercent}%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectMode(OrderType.EXPRESS);
                    setCheckoutError(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    initialMode === OrderType.EXPRESS
                      ? 'bg-white text-[#C81E1E] shadow-2xs'
                      : 'text-stone-600'
                  }`}
                >
                  <Bike className="w-3.5 h-3.5" />
                  Exprés (+{formatColones(settings.expressDeliveryFee)})
                </button>
              </div>

              {/* Cart Items List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  Platillos seleccionados ({totalCartItems})
                </h3>
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-xl border border-stone-200 bg-[#FAF8F5]"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold text-stone-900">
                        {item.name}
                      </div>
                      {item.selectedVariant && (
                        <div className="text-xs font-medium text-[#C81E1E]">
                          Opción: {item.selectedVariant}
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-stone-600 italic">
                          Nota: “{item.notes}”
                        </div>
                      )}
                      <div className="font-mono text-xs font-semibold text-stone-700 pt-1">
                        {formatColones(item.price * item.quantity)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="font-mono text-sm font-bold w-5 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Conditional Form: DINE_IN (Table QR) vs EXPRESS (<= 1 km) */}
              {initialMode === OrderType.DINE_IN ? (
                <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-700">
                      Mesa asignada (vía QR):
                    </label>
                    <select
                      value={activeTable?.id || ''}
                      onChange={(e) => onSelectTable(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-xs font-bold text-stone-900"
                    >
                      {tables
                        .filter((t) => t.active)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Tu nombre (opcional para identificar en mesa):
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Carlos / Familia Mora"
                      className="w-full px-3.5 py-2 bg-white border border-stone-200 rounded-xl text-sm"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                    <strong>Pago en Caja:</strong> Al confirmar, tu pedido se enviará directo a Recepción y Cocina. Puedes pagar al final en la caja con <strong>Efectivo, SINPE Móvil ({settings.sinpeNumber}) o Tarjeta</strong>.
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
                    <Bike className="w-4 h-4 text-[#C81E1E] shrink-0 mt-0.5" />
                    <div>
                      <strong>Cobertura Servicio Exprés:</strong> Únicamente para entregas hasta{' '}
                      <strong>{settings.expressRadiusKm} km a la redonda</strong> del restaurante. Tarifa fija de envío:{' '}
                      <strong className="font-mono">{formatColones(settings.expressDeliveryFee)}</strong>.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Teléfono / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej. 8888-8888"
                        className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Dirección exacta y señas (máx. {settings.expressRadiusKm} km a la redonda) *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Color de casa, portón, punto de referencia cercano..."
                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={withinOneKmConfirmed}
                      onChange={(e) => setWithinOneKmConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#C81E1E] rounded"
                    />
                    <span className="text-xs font-medium text-stone-700">
                      Confirmo que mi ubicación de entrega se encuentra dentro de{' '}
                      <strong>{settings.expressRadiusKm} km a la redonda</strong> de Pollo Cervecero Karen.
                    </span>
                  </label>

                  {/* Payment Method Selector (Express Only: SINPE Móvil or Efectivo) */}
                  <div className="pt-2 border-t border-stone-200 space-y-3">
                    <label className="block text-xs font-bold text-stone-800">
                      Método de pago para tu Exprés:
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setExpressPaymentMethod(PaymentMethod.SINPE)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          expressPaymentMethod === PaymentMethod.SINPE
                            ? 'bg-red-50 border-[#C81E1E] text-[#C81E1E]'
                            : 'bg-white border-stone-200 text-stone-700'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        SINPE Móvil
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpressPaymentMethod(PaymentMethod.EFECTIVO)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          expressPaymentMethod === PaymentMethod.EFECTIVO
                            ? 'bg-red-50 border-[#C81E1E] text-[#C81E1E]'
                            : 'bg-white border-stone-200 text-stone-700'
                        }`}
                      >
                        <span>Efectivo</span>
                      </button>
                    </div>

                    {expressPaymentMethod === PaymentMethod.SINPE ? (
                      <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[11px] text-stone-500">
                              Realiza el SINPE Móvil por <strong className="font-mono text-stone-900">{formatColones(totalAmount)}</strong> al número:
                            </div>
                            <div className="font-mono text-lg font-extrabold text-[#C81E1E]">
                              {settings.sinpeNumber}
                            </div>
                            <div className="text-[11px] text-stone-500">
                              A nombre de: {settings.sinpeOwnerName}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopySinpe}
                            className="px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-800 flex items-center gap-1.5"
                          >
                            {copiedSinpe ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copiar
                              </>
                            )}
                          </button>
                        </div>

                        {/* Screenshot Upload for SINPE Receipt */}
                        <div className="space-y-2 pt-2 border-t border-stone-100">
                          <label className="block text-xs font-bold text-stone-800">
                            Adjuntar captura de pantalla del comprobante SINPE *
                          </label>

                          {!sinpeReceiptImage ? (
                            <label className="flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed border-stone-300 hover:border-[#C81E1E] rounded-xl bg-stone-50 cursor-pointer transition-colors text-center">
                              <Upload className="w-5 h-5 text-[#C81E1E]" />
                              <span className="text-xs font-semibold text-stone-800">
                                {isUploadingReceipt
                                  ? 'Procesando captura...'
                                  : 'Toca aquí para subir captura del comprobante'}
                              </span>
                              <span className="text-[11px] text-stone-500">
                                Imagen desde tu galería o captura de pantalla
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleReceiptFileChange}
                                className="hidden"
                              />
                            </label>
                          ) : (
                            <div className="relative rounded-xl border border-emerald-300 bg-emerald-50/40 p-2.5 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={sinpeReceiptImage}
                                  alt="Vista previa comprobante SINPE"
                                  referrerPolicy="no-referrer"
                                  className="w-14 h-14 object-cover rounded-lg border border-stone-200"
                                />
                                <div>
                                  <div className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Comprobante adjuntado
                                  </div>
                                  <p className="text-[11px] text-stone-600">
                                    Se enviará a recepción junto con tu pedido
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSinpeReceiptImage('')}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Cambiar
                              </button>
                            </div>
                          )}

                          <input
                            type="text"
                            value={sinpeReference}
                            onChange={(e) => setSinpeReference(e.target.value)}
                            placeholder="Número de comprobante o nombre de quien envía (opcional)"
                            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-2">
                        <label className="block text-xs font-bold text-stone-700">
                          ¿Con cuánto efectivo pagas? (Para enviarte el vuelto exacto)
                        </label>
                        <input
                          type="number"
                          min={totalAmount}
                          step="100"
                          value={cashChangeFor}
                          onChange={(e) => setCashChangeFor(e.target.value)}
                          placeholder={`Ej. 5000 o 10000 (Total: ${formatColones(totalAmount)})`}
                          className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm font-mono"
                        />
                        {Number(cashChangeFor) > totalAmount && (
                          <div className="text-xs text-emerald-700 font-semibold font-mono">
                            Vuelto a entregarte: {formatColones(Number(cashChangeFor) - totalAmount)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-stone-200 space-y-2 text-sm">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Subtotal platillos</span>
                  <span className="font-mono tabular-nums">{formatColones(subtotal)}</span>
                </div>

                {initialMode === OrderType.DINE_IN ? (
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Servicio en restaurante (+{settings.serviceChargePercent}%)</span>
                    <span className="font-mono tabular-nums">{formatColones(serviceFee)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Tarifa Servicio Exprés (≤ {settings.expressRadiusKm} km)</span>
                    <span className="font-mono tabular-nums">{formatColones(deliveryFee)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-base font-bold text-stone-900">
                  <span>
                    {initialMode === OrderType.DINE_IN
                      ? 'Total a pagar en Caja'
                      : 'Total Exprés'}
                  </span>
                  <span className="font-mono text-lg text-[#C81E1E] tabular-nums">
                    {formatColones(totalAmount)}
                  </span>
                </div>
              </div>

              {checkoutError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}
            </form>

            {/* Drawer Footer CTA */}
            <div className="p-4 border-t border-stone-200 bg-white">
              <button
                type="submit"
                form="checkout-form"
                disabled={isSubmitting || isUploadingReceipt}
                className="w-full h-12 rounded-xl bg-[#C81E1E] hover:bg-[#A91919] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Enviando pedido...</span>
                ) : initialMode === OrderType.DINE_IN ? (
                  <>
                    <Utensils className="w-4 h-4" />
                    <span>
                      Enviar Pedido de {activeTable?.name || 'Mesa'} ({formatColones(totalAmount)})
                    </span>
                  </>
                ) : (
                  <>
                    <FileImage className="w-4 h-4" />
                    <span>
                      Confirmar Pedido Exprés ({formatColones(totalAmount)})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
