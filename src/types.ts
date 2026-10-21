export enum CategoryId {
  PLATO_DEL_DIA = "plato_del_dia",
  DESAYUNOS = "desayunos",
  CASADOS = "casados",
  COMIDA_RAPIDA = "comida_rapida",
  REFRESCOS = "refrescos",
}

export enum OrderType {
  DINE_IN = "dine_in",
  EXPRESS = "express",
}

export enum OrderStatus {
  PENDING_RECEPTION = "pending_reception",
  IN_KITCHEN = "in_kitchen",
  READY = "ready",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}

export enum PaymentMethod {
  PENDING_CAJA = "pendiente_caja",
  SINPE = "sinpe",
  EFECTIVO = "efectivo",
  TARJETA = "tarjeta",
}

export interface MenuItem {
  id: string;
  name: string;
  category: CategoryId;
  price: number;
  description?: string;
  scheduleText?: string;
  variants?: string[];
  available: boolean;
  featured?: boolean;
}

export interface RestaurantTable {
  qrToken?: string;
  id: string;
  number: number;
  name: string;
  capacity: number;
  active: boolean;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedVariant?: string;
  notes?: string;
}

export interface Order {
  ownerHash?: string;
  requestKey?: string;
  requestHash?: string;
  isTest?: boolean;
  coverageStatus?: "pending" | "verified";
  sinpeVerified?: boolean;
  paidBy?: string;
  id: string;
  orderNumber: number;
  orderType: OrderType;
  // For Dine-In (Table QR)
  tableId?: string;
  tableName?: string;
  // For Express (<= 1 km)
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  withinOneKmConfirmed?: boolean;
  // Items & Pricing
  items: OrderItem[];
  subtotal: number;
  serviceFee: number; // 10% for dine_in, 0 for express
  deliveryFee: number; // 500 for express, 0 for dine_in
  total: number;
  // Payment
  paymentMethod: PaymentMethod;
  sinpeReference?: string;
  sinpeReceiptImage?: string; // base64 screenshot uploaded on Express SINPE orders
  cashChangeFor?: number;
  isPaid: boolean;
  // Status & Timestamps
  status: OrderStatus;
  createdAt: string;
  sentToKitchenAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  paidAt?: string;
}

export interface RestaurantSettings {
  restaurantName: string;
  sinpeNumber: string;
  sinpeOwnerName: string;
  facebookHandle: string;
  scheduleText: string;
  serviceChargePercent: number;
  expressDeliveryFee: number;
  expressRadiusKm: number;
  dailySpecialDescription: string;
}

export interface AppStatePayload {
  revision?: number;
  menu: MenuItem[];
  tables: RestaurantTable[];
  orders: Order[];
  settings: RestaurantSettings;
}
