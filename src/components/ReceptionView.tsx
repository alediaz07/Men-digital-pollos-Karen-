import React, { useState, useMemo } from 'react';
import {
  ChefHat,
  CheckCircle2,
  Clock,
  Utensils,
  Bike,
  Eye,
  CreditCard,
  Banknote,
  Smartphone,
  MapPin,
  Phone,
  XCircle,
  X,
  ArrowRight,
  Search,
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  OrderType,
  PaymentMethod,
  RestaurantSettings,
} from '../types';
import { formatColones, getElapsedMinutes } from '../utils/format';
import { costaRicaDate } from '../utils/sales';

interface ReceptionViewProps {
  orders: Order[];
  settings: RestaurantSettings;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
}

export const ReceptionView: React.FC<ReceptionViewProps> = ({
  orders,
  settings,
  onUpdateOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'history'>('pending');
  const [filterType, setFilterType] = useState<'all' | OrderType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal for viewing full-size SINPE receipt screenshot
  const [previewReceiptOrder, setPreviewReceiptOrder] = useState<Order | null>(null);

  // Modal for charging at Cashier (Caja) for Table orders (or unpaid orders)
  const [cashierOrder, setCashierOrder] = useState<Order | null>(null);
  const [selectedCajaMethod, setSelectedCajaMethod] = useState<
    PaymentMethod.EFECTIVO | PaymentMethod.SINPE | PaymentMethod.TARJETA
  >(PaymentMethod.EFECTIVO);
  const [cajaCashReceived, setCajaCashReceived] = useState<string>('');
  const [cajaSinpeRef, setCajaSinpeRef] = useState<string>('');

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PENDING_RECEPTION),
    [orders]
  );

  const activeKitchenOrCajaOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.IN_KITCHEN ||
          o.status === OrderStatus.READY ||
          (o.status === OrderStatus.DELIVERED && !o.isPaid)
      ),
    [orders]
  );

  const historyOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status === OrderStatus.DELIVERED && o.isPaid) ||
          o.status === OrderStatus.CANCELLED
      ),
    [orders]
  );

  const currentList = useMemo(() => {
    const base =
      activeTab === 'pending'
        ? pendingOrders
        : activeTab === 'active'
        ? activeKitchenOrCajaOrders
        : historyOrders;

    return base.filter((o) => {
      if (filterType !== 'all' && o.orderType !== filterType) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        String(o.orderNumber).includes(q) ||
        (o.tableName && o.tableName.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.toLowerCase().includes(q))
      );
    });
  }, [
    activeTab,
    pendingOrders,
    activeKitchenOrCajaOrders,
    historyOrders,
    filterType,
    searchTerm,
  ]);

  const handleSendToKitchen = async (order: Order) => {
    if (order.orderType === OrderType.EXPRESS && order.paymentMethod === PaymentMethod.SINPE && !order.isPaid) {
      setPreviewReceiptOrder(order);
      window.alert("Verifica primero el abono SINPE en el banco, registra su referencia y confirma cobertura antes de enviarlo a cocina.");
      return;
    }
    if (order.orderType === OrderType.EXPRESS && order.coverageStatus !== "verified" && !window.confirm("¿Verificaste que la dirección está dentro del kilómetro de cobertura?")) return;
    await onUpdateOrder(order.id, {
      coverageStatus: order.orderType === OrderType.EXPRESS ? "verified" : undefined,
      status: OrderStatus.IN_KITCHEN,
    });
  };

  const handleOpenCajaModal = (order: Order) => {
    setCashierOrder(order);
    if (
      order.paymentMethod === PaymentMethod.SINPE ||
      order.paymentMethod === PaymentMethod.EFECTIVO ||
      order.paymentMethod === PaymentMethod.TARJETA
    ) {
      setSelectedCajaMethod(order.paymentMethod);
    } else {
      setSelectedCajaMethod(PaymentMethod.EFECTIVO);
    }
    setCajaCashReceived(order.cashChangeFor ? String(order.cashChangeFor) : '');
    setCajaSinpeRef(order.sinpeReference || '');
  };

  const handleConfirmCajaPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierOrder) return;
    if (selectedCajaMethod === PaymentMethod.EFECTIVO && cajaCashReceived && Number(cajaCashReceived) < cashierOrder.total) throw new Error('El efectivo recibido es menor al total.');
    if (selectedCajaMethod === PaymentMethod.SINPE && (cajaSinpeRef.trim() || cashierOrder.sinpeReference || "").trim().length < 4) { window.alert("Introduce una referencia bancaria de al menos 4 caracteres."); return; }
    if (selectedCajaMethod === PaymentMethod.SINPE && !window.confirm('¿Verificaste el abono en la cuenta bancaria? La captura por sí sola no confirma el pago.')) return;
    await onUpdateOrder(cashierOrder.id, {
      paymentMethod: selectedCajaMethod,
      sinpeReference:
        selectedCajaMethod === PaymentMethod.SINPE
          ? cajaSinpeRef.trim() || cashierOrder.sinpeReference
          : cashierOrder.sinpeReference,
      isPaid: true,
      sinpeVerified: selectedCajaMethod === PaymentMethod.SINPE,
    });
    setCashierOrder(null);
  };

  const getPaymentLabel = (method: PaymentMethod) => {
    switch (method) {
      case PaymentMethod.SINPE:
        return `SINPE Móvil (${settings.sinpeNumber})`;
      case PaymentMethod.EFECTIVO:
        return 'Efectivo';
      case PaymentMethod.TARJETA:
        return 'Tarjeta en Caja';
      default:
        return 'Pendiente cobro en Caja';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header & Top Metrics */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">
            Recepción de Pedidos y Caja
          </h1>
          <p className="text-sm text-stone-600 mt-0.5">
            Aprueba pedidos entrantes para enviarlos a cocina, verifica capturas SINPE de Exprés y realiza el cobro en caja de las mesas.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:min-w-[420px]">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-800 font-medium">Nuevos por aprobar</div>
            <div className="font-mono text-2xl font-bold text-amber-900 tabular-nums mt-0.5">
              {pendingOrders.length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-stone-100 border border-stone-200">
            <div className="text-xs text-stone-600 font-medium">En Cocina / Por Cobrar</div>
            <div className="font-mono text-2xl font-bold text-stone-900 tabular-nums mt-0.5">
              {activeKitchenOrCajaOrders.length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="text-xs text-emerald-800 font-medium">Cerrados Hoy</div>
            <div className="font-mono text-2xl font-bold text-emerald-900 tabular-nums mt-0.5">
              {historyOrders.filter((o) => o.isPaid && costaRicaDate(o.paidAt || o.createdAt) === costaRicaDate(new Date().toISOString())).length}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar & Segmented Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-stone-200/70 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-[#C81E1E] text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            1. Nuevos Recibidos ({pendingOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'active'
                ? 'bg-stone-900 text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            2. En Cocina y Caja ({activeKitchenOrCajaOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-stone-900 text-white shadow-2xs'
                : 'text-stone-700 hover:text-stone-900'
            }`}
          >
            3. Historial Pagados ({historyOrders.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-stone-200 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                filterType === 'all' ? 'bg-stone-900 text-white' : 'text-stone-600'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterType(OrderType.DINE_IN)}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                filterType === OrderType.DINE_IN
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600'
              }`}
            >
              Mesas
            </button>
            <button
              type="button"
              onClick={() => setFilterType(OrderType.EXPRESS)}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                filterType === OrderType.EXPRESS
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600'
              }`}
            >
              Exprés
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Mesa, #orden, cliente..."
              className="pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-xs sm:text-sm w-44 sm:w-56 focus:outline-none focus:border-stone-400"
            />
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      {currentList.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center space-y-2">
          <ChefHat className="w-10 h-10 text-stone-400 mx-auto" />
          <h3 className="text-base font-bold text-stone-800">
            {activeTab === 'pending'
              ? 'No hay pedidos nuevos pendientes de aprobar'
              : activeTab === 'active'
              ? 'No hay pedidos activos en cocina o pendientes de cobro'
              : 'Aún no hay pedidos cerrados en el historial'}
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Cuando un cliente escanee el código QR de su mesa o envíe un pedido Exprés desde el menú digital, aparecerá aquí al instante.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentList.map((order) => {
            const isExpress = order.orderType === OrderType.EXPRESS;

            return (
              <div
                key={order.id}
                className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-2xs"
              >
                <div className="space-y-3">
                  {/* Top Row: Order Number + Mode + Elapsed Time */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-extrabold text-stone-900">
                          #{order.orderNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        {isExpress ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#C81E1E]">
                            <Bike className="w-3.5 h-3.5" />
                            SERVICIO EXPRÉS (≤ 1 km)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-900">
                            <Utensils className="w-3.5 h-3.5 text-stone-700" />
                            {order.tableName || 'En Mesa'}
                          </span>
                        )}
                      </div>

                      {order.customerName && (
                        <div className="text-xs font-medium text-stone-600 mt-0.5">
                          Cliente: <strong>{order.customerName}</strong>
                          {order.customerPhone ? ` · Tel: ${order.customerPhone}` : ''}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 text-xs text-stone-500">
                        <Clock className="w-3.5 h-3.5" />
                        {getElapsedMinutes(order.createdAt)}
                      </div>
                      <div className="text-[11px] font-semibold mt-0.5">
                        {order.status === OrderStatus.PENDING_RECEPTION && (
                          <span className="text-amber-700">Por aprobar</span>
                        )}
                        {order.status === OrderStatus.IN_KITCHEN && (
                          <span className="text-blue-700">En Cocina</span>
                        )}
                        {order.status === OrderStatus.READY && (
                          <span className="text-emerald-700 font-bold">
                            ¡Listo en Cocina!
                          </span>
                        )}
                        {order.status === OrderStatus.DELIVERED && (
                          <span className="text-stone-600">Entregado</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Express Address Box */}
                  {isExpress && order.deliveryAddress && (
                    <div className="p-3 rounded-xl bg-red-50/60 border border-red-200/80 text-xs text-stone-800 space-y-1">
                      <div className="flex items-center justify-between font-bold text-[#C81E1E]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          Dirección Exprés (≤ 1 km):
                        </span>
                        {order.customerPhone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3" />
                            {order.customerPhone}
                          </span>
                        )}
                      </div>
                      <p className="text-stone-700 leading-snug">{order.deliveryAddress}</p>
                    </div>
                  )}

                  {/* Order Items */}
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 text-xs sm:text-sm py-1 border-b border-stone-100 last:border-b-0"
                      >
                        <div>
                          <span className="font-mono font-bold text-stone-900 mr-1.5">
                            {item.quantity}x
                          </span>
                          <span className="font-semibold text-stone-900">{item.name}</span>
                          {item.selectedVariant && (
                            <span className="block text-xs text-[#C81E1E] font-medium ml-5">
                              Opción: {item.selectedVariant}
                            </span>
                          )}
                          {item.notes && (
                            <span className="block text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded mt-0.5 ml-5">
                              Nota: “{item.notes}”
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs font-semibold text-stone-700 tabular-nums shrink-0">
                          {formatColones(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Pricing & Payment Details */}
                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-stone-200/80 space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">
                        {formatColones(order.subtotal)}
                      </span>
                    </div>
                    {order.orderType === OrderType.DINE_IN ? (
                      <div className="flex justify-between text-stone-600">
                        <span>+10% Servicio en restaurante</span>
                        <span className="font-mono tabular-nums">
                          {formatColones(order.serviceFee)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-stone-600">
                        <span>Tarifa Exprés (1 km)</span>
                        <span className="font-mono tabular-nums">
                          {formatColones(order.deliveryFee)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
                      <span>Total</span>
                      <span className="font-mono text-[#C81E1E] tabular-nums">
                        {formatColones(order.total)}
                      </span>
                    </div>

                    <div className="pt-1.5 flex items-center justify-between text-xs">
                      <span className="text-stone-600">
                        Pago: <strong>{getPaymentLabel(order.paymentMethod)}</strong>
                        {order.orderType === OrderType.EXPRESS && order.paymentMethod === PaymentMethod.EFECTIVO && order.cashChangeFor != null && <span className="block font-bold">Efectivo anunciado: {formatColones(order.cashChangeFor)} · Vuelto estimado: {formatColones(Math.max(0,order.cashChangeFor-order.total))}</span>}
                        {order.orderType === OrderType.DINE_IN && !order.isPaid && <span className="block text-xs">Cobro agrupado por mesa desde la pestaña Caja del administrador.</span>}
                      </span>
                      <span
                        className={`font-bold ${
                          order.isPaid ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {order.isPaid ? 'PAGADO' : 'POR COBRAR'}
                      </span>
                    </div>

                    {order.orderType === OrderType.EXPRESS && <p className="text-xs font-bold text-amber-800">Cobertura: {order.coverageStatus === 'verified' ? 'Verificada por recepción' : 'Pendiente de verificar dirección'}</p>}
                    {order.cashChangeFor && order.cashChangeFor > order.total && (
                      <div className="text-xs text-stone-700 font-mono pt-0.5">
                        Paga con {formatColones(order.cashChangeFor)} · Vuelto:{' '}
                        <strong>{formatColones(order.cashChangeFor - order.total)}</strong>
                      </div>
                    )}

                    {/* SINPE Receipt Screenshot Preview for Express Orders */}
                    {order.sinpeReceiptImage && (
                      <div className="pt-2 mt-2 border-t border-stone-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={order.sinpeReceiptImage}
                            alt="Comprobante SINPE"
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-lg object-cover border border-stone-300"
                          />
                          <div>
                            <div className="font-bold text-stone-900">
                              Captura SINPE adjunta
                            </div>
                            {order.sinpeReference && (
                              <div className="text-[11px] text-stone-500">
                                Ref: {order.sinpeReference}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewReceiptOrder(order)}
                          className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver captura
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Footer Buttons */}
                <div className="pt-2 space-y-2">
                  {order.status === OrderStatus.PENDING_RECEPTION && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendToKitchen(order)}
                        className="flex-1 py-2.5 px-4 bg-[#C81E1E] hover:bg-[#A91919] text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>Enviar a Cocina</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          (() => { const reason = window.prompt("Motivo de cancelación (mínimo 5 caracteres):"); if (reason && reason.trim().length >= 5) void onUpdateOrder(order.id, { status: OrderStatus.CANCELLED, cancellationReason: reason.trim() }); })()
                        }
                        title="Cancelar pedido"
                        className="p-2.5 rounded-xl border border-stone-200 text-stone-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {order.status !== OrderStatus.CANCELLED && (
                    <div className="flex items-center gap-2">
                      {!order.isPaid && order.orderType !== OrderType.DINE_IN && (
                        <button
                          type="button"
                          onClick={() => handleOpenCajaModal(order)}
                          className="flex-1 py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Banknote className="w-4 h-4" />
                          <span>
                            {order.orderType === OrderType.DINE_IN
                              ? 'Cobrar en Caja'
                              : 'Confirmar Pago'}
                          </span>
                        </button>
                      )}

                      {(order.status === OrderStatus.READY) && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOrder(order.id, { status: OrderStatus.DELIVERED })
                          }
                          className="flex-1 py-2.5 px-3 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Marcar Entregado</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen SINPE Receipt Screenshot Modal */}
      {previewReceiptOrder && previewReceiptOrder.sinpeReceiptImage && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-stone-200">
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">
                  Comprobante SINPE Móvil · Orden #{previewReceiptOrder.orderNumber}
                </h3>
                <p className="text-xs text-stone-500">
                  Cliente: {previewReceiptOrder.customerName || 'Exprés'} · Total:{' '}
                  <strong className="font-mono text-[#C81E1E]">
                    {formatColones(previewReceiptOrder.total)}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceiptOrder(null)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-stone-900 flex items-center justify-center max-h-[70vh] overflow-y-auto">
              <img
                src={previewReceiptOrder.sinpeReceiptImage}
                alt="Captura de pantalla SINPE"
                referrerPolicy="no-referrer"
                className="max-h-[65vh] w-auto rounded-lg object-contain"
              />
            </div>
            <div className="p-4 bg-white border-t border-stone-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPreviewReceiptOrder(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700"
              >
                Cerrar vista
              </button>
              <div className="flex items-center gap-2">
                {!previewReceiptOrder.isPaid && (
                  <button
                    type="button"
                    onClick={async () => {
                      const reference = window.prompt('Referencia bancaria del abono verificado:', previewReceiptOrder.sinpeReference || '');
                      if (!reference || reference.trim().length < 4 || !window.confirm('¿Confirmas que el abono SINPE está verificado en la cuenta bancaria?')) return;
                      await onUpdateOrder(previewReceiptOrder.id, { isPaid: true, sinpeVerified: true, sinpeReference: reference.trim() });
                      setPreviewReceiptOrder(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Marcar SINPE Verificado y Pagado
                  </button>
                )}
                {previewReceiptOrder.status === OrderStatus.PENDING_RECEPTION && (
                  <button
                    type="button"
                    onClick={async () => {
                      const reference = window.prompt('Referencia bancaria del abono verificado:', previewReceiptOrder.sinpeReference || '');
                      if (!reference || reference.trim().length < 4 || !window.confirm('¿Verificaste el abono SINPE y la cobertura de la dirección de entrega?')) return;
                      await onUpdateOrder(previewReceiptOrder.id, {
                        sinpeReference: reference.trim(),
                        coverageStatus: previewReceiptOrder.orderType === OrderType.EXPRESS ? 'verified' : undefined,
                        sinpeVerified: true,
                        isPaid: true,
                        status: OrderStatus.IN_KITCHEN,
                      });
                      setPreviewReceiptOrder(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#C81E1E] hover:bg-[#A91919] text-white text-xs font-bold cursor-pointer"
                  >
                    Verificar y Enviar a Cocina
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cashier Payment Modal (Cobro en Caja para Mesas y Pedidos) */}
      {cashierOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCajaPayment}
            className="bg-white rounded-2xl max-w-md w-full p-6 border border-stone-200 shadow-xl space-y-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-700 uppercase">
                  Cobro en Caja
                </span>
                <h3 className="font-display text-xl font-bold text-stone-900">
                  Orden #{cashierOrder.orderNumber} ·{' '}
                  {cashierOrder.orderType === OrderType.DINE_IN
                    ? cashierOrder.tableName
                    : 'Servicio Exprés'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCashierOrder(null)}
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-stone-200 space-y-1.5 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span className="font-mono">{formatColones(cashierOrder.subtotal)}</span>
              </div>
              {cashierOrder.orderType === OrderType.DINE_IN ? (
                <div className="flex justify-between text-stone-600">
                  <span>+10% Servicio en restaurante</span>
                  <span className="font-mono">
                    {formatColones(cashierOrder.serviceFee)}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-stone-600">
                  <span>Tarifa Exprés</span>
                  <span className="font-mono">
                    {formatColones(cashierOrder.deliveryFee)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-stone-900 pt-2 border-t border-stone-200">
                <span>Total a cobrar</span>
                <span className="font-mono text-xl text-[#C81E1E]">
                  {formatColones(cashierOrder.total)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700">
                Selecciona el método de pago recibido en caja:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCajaMethod(PaymentMethod.EFECTIVO)}
                  className={`py-3 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                    selectedCajaMethod === PaymentMethod.EFECTIVO
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                      : 'bg-white border-stone-200 text-stone-700'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCajaMethod(PaymentMethod.SINPE)}
                  className={`py-3 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                    selectedCajaMethod === PaymentMethod.SINPE
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                      : 'bg-white border-stone-200 text-stone-700'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  SINPE Móvil
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCajaMethod(PaymentMethod.TARJETA)}
                  className={`py-3 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                    selectedCajaMethod === PaymentMethod.TARJETA
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                      : 'bg-white border-stone-200 text-stone-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Tarjeta
                </button>
              </div>
            </div>

            {selectedCajaMethod === PaymentMethod.EFECTIVO && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700">
                  Monto recibido en efectivo (opcional para calcular vuelto):
                </label>
                <input
                  type="number"
                  value={cajaCashReceived}
                  onChange={(e) => setCajaCashReceived(e.target.value)}
                  placeholder={`Ej. 10000`}
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm font-mono"
                />
                {Number(cajaCashReceived) >= cashierOrder.total && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex justify-between">
                    <span>Vuelto a entregar al cliente:</span>
                    <span className="font-mono text-sm">
                      {formatColones(Number(cajaCashReceived) - cashierOrder.total)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {selectedCajaMethod === PaymentMethod.SINPE && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-700">
                  Referencia / Comprobante SINPE ({settings.sinpeNumber}):
                </label>
                <input
                  type="text"
                  value={cajaSinpeRef}
                  onChange={(e) => setCajaSinpeRef(e.target.value)}
                  placeholder="Referencia bancaria verificada (obligatoria)"
                  className="w-full px-3.5 py-2 border border-stone-200 rounded-xl text-sm"
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCashierOrder(null)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm cursor-pointer"
              >
                Registrar Pago ({formatColones(cashierOrder.total)})
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
