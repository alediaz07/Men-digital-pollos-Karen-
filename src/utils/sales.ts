import { Order, OrderStatus, OrderType, PaymentMethod } from "../types";
export const costaRicaDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export function dateRange(
  period: string,
  start: string,
  end: string,
  now = new Date(),
) {
  const today = costaRicaDate(now.toISOString());
  const back = (n: number) =>
    costaRicaDate(new Date(now.getTime() - n * 86400000).toISOString());
  if (period === "yesterday") return [back(1), back(1)];
  if (period === "week") return [back(6), today];
  if (period === "month") return [today.slice(0, 7) + "-01", today];
  if (period === "custom") return [start, end];
  return [today, today];
}
export function sales(orders: Order[], from: string, to: string) {
  const inside = (iso: string) => {
    const d = costaRicaDate(iso);
    return !!from && !!to && d >= from && d <= to;
  };
  const real = orders.filter(
    (o) => !o.isTest && !/^ord-demo-(100|101)$/.test(o.id),
  );
  const history = real.filter((o) => inside(o.createdAt));
  const paid = real.filter(
    (o) =>
      o.isPaid &&
      o.status !== OrderStatus.CANCELLED &&
      inside(o.paidAt || o.createdAt),
  );
  const sum = (
    list: Order[],
    key: "total" | "serviceFee" | "deliveryFee" = "total",
  ) => list.reduce((n, o) => n + o[key], 0);
  const dine = paid.filter((o) => o.orderType === OrderType.DINE_IN);
  const express = paid.filter((o) => o.orderType === OrderType.EXPRESS);
  return {
    history,
    totalOrders: history.length,
    paidCount: paid.length,
    pendingCount: history.filter(
      (o) => !o.isPaid && o.status !== OrderStatus.CANCELLED,
    ).length,
    pendingTotal: sum(
      history.filter((o) => !o.isPaid && o.status !== OrderStatus.CANCELLED),
    ),
    cancelledCount: history.filter((o) => o.status === OrderStatus.CANCELLED)
      .length,
    totalRevenue: sum(paid),
    dineInCount: dine.length,
    dineInRevenue: sum(dine),
    expressCount: express.length,
    expressRevenue: sum(express),
    totalServiceCharge: sum(paid, "serviceFee"),
    totalDeliveryFees: sum(paid, "deliveryFee"),
    bySinpe: sum(paid.filter((o) => o.paymentMethod === PaymentMethod.SINPE)),
    byCash: sum(paid.filter((o) => o.paymentMethod === PaymentMethod.EFECTIVO)),
    byCard: sum(paid.filter((o) => o.paymentMethod === PaymentMethod.TARJETA)),
  };
}
