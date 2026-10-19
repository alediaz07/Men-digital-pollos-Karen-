import React, { useMemo } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Utensils,
  Bike,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { Order, OrderStatus, OrderType } from '../types';
import { getElapsedMinutes } from '../utils/format';

interface KitchenKDSViewProps {
  orders: Order[];
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => Promise<void>;
}

export const KitchenKDSView: React.FC<KitchenKDSViewProps> = ({
  orders,
  onUpdateOrder,
}) => {
  const inKitchenOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === OrderStatus.IN_KITCHEN)
        .sort(
          (a, b) =>
            new Date(a.sentToKitchenAt || a.createdAt).getTime() -
            new Date(b.sentToKitchenAt || b.createdAt).getTime()
        ),
    [orders]
  );

  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.READY),
    [orders]
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0F172A] text-slate-100 px-4 sm:px-6 py-6 space-y-6">
      {/* KDS Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#C81E1E] flex items-center justify-center text-white">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-wide">
              Pantalla de Cocina (KDS)
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Comandas aprobadas por Recepción · Ordenadas por orden de llegada
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="px-4 py-2 rounded-xl bg-slate-800/90 border border-slate-700">
            <span className="text-xs text-slate-400 block">En preparación</span>
            <span className="font-mono text-xl font-bold text-amber-400 tabular-nums">
              {inKitchenOrders.length}
            </span>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-800/90 border border-slate-700">
            <span className="text-xs text-slate-400 block">Listos para entregar</span>
            <span className="font-mono text-xl font-bold text-emerald-400 tabular-nums">
              {readyOrders.length}
            </span>
          </div>
        </div>
      </div>

      {/* Active Kitchen Tickets */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          Comandas en Preparación ({inKitchenOrders.length})
        </h2>

        {inKitchenOrders.length === 0 ? (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-12 text-center space-y-2">
            <ChefHat className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-lg font-bold text-slate-300">
              Cocina al día — Sin comandas en preparación
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Cuando Recepción apruebe un pedido de Mesa o de Servicio Exprés, aparecerá inmediatamente en esta pantalla.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inKitchenOrders.map((order) => {
              const isExpress = order.orderType === OrderType.EXPRESS;
              const totalDishes = order.items.reduce((acc, i) => acc + i.quantity, 0);

              return (
                <div
                  key={order.id}
                  className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  {/* Ticket Header */}
                  <div>
                    <div
                      className={`px-4 py-3 flex items-center justify-between ${
                        isExpress ? 'bg-amber-600 text-white' : 'bg-[#C81E1E] text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xl font-extrabold">
                          #{order.orderNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        {isExpress ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-extrabold uppercase">
                            <Bike className="w-4 h-4" />
                            EMPACAR EXPRÉS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-extrabold uppercase">
                            <Utensils className="w-4 h-4" />
                            {order.tableName || 'MESA'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs font-mono font-semibold bg-black/25 px-2.5 py-1 rounded-lg">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {getElapsedMinutes(order.sentToKitchenAt || order.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Customer / Pack Indication */}
                    <div className="px-4 py-2 bg-slate-800/70 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                      <span>
                        {isExpress
                          ? `Para llevar (Exprés) · ${order.customerName || 'Cliente'}`
                          : `Servir en salón · ${order.tableName}`}
                      </span>
                      <span className="font-mono font-bold text-slate-200">
                        {totalDishes} {totalDishes === 1 ? 'plato' : 'platos'}
                      </span>
                    </div>

                    {/* Dishes List */}
                    <div className="p-4 space-y-3">
                      {order.items.map((item) => (
                        <div
                          key={item.id}
                          className="pb-3 border-b border-slate-800 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-start gap-3">
                            <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 font-mono text-base font-extrabold text-amber-400 flex items-center justify-center shrink-0 tabular-nums">
                              {item.quantity}x
                            </span>
                            <div className="space-y-1 flex-1">
                              <div className="text-base font-bold text-white leading-snug">
                                {item.name}
                              </div>
                              {item.selectedVariant && (
                                <div className="text-xs font-bold text-emerald-400">
                                  Opción: {item.selectedVariant}
                                </div>
                              )}
                              {item.notes && (
                                <div className="mt-1 p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span>Nota: {item.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ticket Action Button */}
                  <div className="p-4 pt-2 border-t border-slate-800 bg-slate-900/50">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateOrder(order.id, { status: OrderStatus.READY })
                      }
                      className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>¡Pedido Listo para Entregar!</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ready to Serve / Dispatch Section */}
      {readyOrders.length > 0 && (
        <div className="pt-6 border-t border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
            Listos en Ventanilla — Esperando Entrega ({readyOrders.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {readyOrders.map((order) => (
              <div
                key={order.id}
                className="bg-slate-900 border border-emerald-600/60 rounded-xl p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-emerald-400">
                      #{order.orderNumber} ·{' '}
                      {order.orderType === OrderType.DINE_IN
                        ? order.tableName
                        : 'EXPRÉS'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {getElapsedMinutes(order.readyAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2">
                    {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateOrder(order.id, { status: OrderStatus.DELIVERED })
                  }
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Marcar Despachado</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
