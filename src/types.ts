export interface Provider {
  id: string;
  name: string;
  hasLot: boolean;
  hasPartida: boolean;
  hasTono: boolean;
  hasRollNo: boolean;
  hasWidth?: boolean;
  hasWeight?: boolean;
  createdAt: string;
}

export interface Article {
  id: string;
  code?: string;
  name: string;
  description: string;
  unit: string;
  providerId: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  dni: string;
  email: string;
  phone: string;
  address: string;
  fiscalAddress?: string;
  contactPerson?: string;
  createdAt: string;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
}

export interface RollItem {
  id: string;
  rollNumber: string;
  articleId: string;
  providerId: string;
  initialMeters: number;
  currentMeters: number;
  lot: string;
  partida: string;
  tono: string;
  status: 'available' | 'sold' | 'partially_sold';
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
  width?: string;
  weight?: string;
}

export interface PackingListItem {
  id: string; // unique for this row
  rollId?: string; // empty if direct entry or custom cut
  rollNumber: string;
  articleId: string;
  providerId: string;
  meters: number;
  lot: string;
  partida: string;
  tono: string;
  width?: string;
  weight?: string;
}

export interface PackingList {
  id: string;
  packingListNo: string;
  type: 'nuevo' | 'antiguo' | 'corte' | 'rollo';
  clientId: string;
  sellerId: string;
  date: string;
  items: PackingListItem[];
  totalMeters: number;
  totalRollsOrCuts: number;
  notes?: string;
  guideNumber?: string;
  dispatchAddress?: string;
  importantNotice: string; // Default: "Revisar el rollo antes de cortar y conservar la etiqueta"
  signedBy: {
    name: string;
    dni: string;
    date: string;
    signaturePresent: boolean;
  };
  createdAt: string;
  omittedFields?: string[];
  appVersion?: string;
}

export interface SalesOrderItem {
  id: string;
  articleId?: string;
  code: string;
  description: string;
  unitPrice: number;
  requestedQty: number;
  dispatchedQty: number;
  totalAmount: number;
}

export interface SalesOrder {
  id: string;
  orderNo: string;
  sellerId?: string;
  sellerName: string;
  date: string;
  clientId?: string;
  clientName: string;
  clientRucDni: string;
  fiscalAddress: string;
  dispatchContactName: string;
  dispatchContactPhone: string;
  dispatchAddress: string;
  floorNumber: string;
  dispatchDate: string;
  dispatchTime: string;
  paymentMethod: string;
  billedAmount: number;
  billingName: string;
  billingRucDni: string;
  pendingAmount: number;
  observations: string;
  items: SalesOrderItem[];
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
  appVersion?: string;
}
