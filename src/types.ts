export type UserRole = 'admin' | 'almacen' | 'vendedor' | 'supervisor' | 'custom';

export interface UserPermissions {
  // 1. Packing List
  packingListCreate: boolean;    // Crear nuevo packing list (rollos / cortes)
  packingListHistory: boolean;   // Ver historial de despachos
  packingListCancel: boolean;    // Anular / eliminar packing list
  packingListPrint: boolean;     // Reimprimir / Descargar PDF y etiquetas
  packingListExport: boolean;    // Exportar historial a Excel
  
  // 2. Inventario de Telas
  inventoryView: boolean;        // Ver stock y consultar rollos
  inventoryAdd: boolean;         // Registrar rollos nuevos manualmente
  inventoryBulkImport: boolean;  // Carga masiva desde Excel
  inventoryAdjust: boolean;      // Ajustar metrajes de rollos
  inventoryDelete: boolean;      // Anular o eliminar rollos
  
  // 3. Notas de Venta / Pedidos
  salesOrdersCreate: boolean;    // Emitir notas de venta
  salesOrdersView: boolean;      // Ver lista de pedidos
  salesOrdersPrint: boolean;     // Imprimir notas y formatos
  
  // 4. Catálogos y Maestros
  manageArticles: boolean;       // Crear/editar telas y artículos
  manageProviders: boolean;      // Crear/editar proveedores y reglas
  manageClients: boolean;        // Crear/editar clientes y RUC/DNI
  manageSellers: boolean;        // Crear/editar vendedores
  
  // 5. Configuración y Seguridad
  manageUsers: boolean;          // Crear, editar y dar permisos a usuarios
  systemConfig: boolean;         // Modos del sistema, correlativos
  testModeAccess: boolean;       // Acceso al botón de "Modo Prueba"
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  status: 'active' | 'inactive';
  permissions: UserPermissions;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

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
  defaultSellerId?: string;
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
  createdAt: string;
  omittedFields?: string[];
  appVersion?: string;
  isTestSimulation?: boolean;
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
  isTestSimulation?: boolean;
}
