import { UserPermissions, UserRole } from '../types';

export const ALL_PERMISSIONS_KEYS: (keyof UserPermissions)[] = [
  'packingListCreate',
  'packingListHistory',
  'packingListCancel',
  'packingListPrint',
  'packingListExport',
  'inventoryView',
  'inventoryAdd',
  'inventoryBulkImport',
  'inventoryAdjust',
  'inventoryDelete',
  'salesOrdersCreate',
  'salesOrdersView',
  'salesOrdersPrint',
  'manageArticles',
  'manageProviders',
  'manageClients',
  'manageSellers',
  'manageUsers',
  'systemConfig',
  'testModeAccess'
];

export const PERMISSION_GROUPS: {
  name: string;
  description: string;
  permissions: { key: keyof UserPermissions; label: string; description: string }[];
}[] = [
  {
    name: 'Packing Lists & Despachos',
    description: 'Control de creación, reimpresión y gestión de packing lists',
    permissions: [
      { key: 'packingListCreate', label: 'Crear Packing List', description: 'Permite registrar nuevos packing lists (rollos o cortes)' },
      { key: 'packingListHistory', label: 'Consultar Historial', description: 'Ver despachos anteriores y buscar por N° de packing list' },
      { key: 'packingListPrint', label: 'Reimprimir / Etiquetas', description: 'Descargar e imprimir documentos y etiquetas térmicas' },
      { key: 'packingListExport', label: 'Exportar a Excel', description: 'Descargar reportes y tablas consolidadas en Excel' },
      { key: 'packingListCancel', label: 'Anular / Eliminar Packing List', description: 'Permite cancelar o revertir despachos ya registrados' }
    ]
  },
  {
    name: 'Inventario de Telas (WMS)',
    description: 'Gestión de rollos, stock físico y metrajes en almacén',
    permissions: [
      { key: 'inventoryView', label: 'Consultar Stock', description: 'Ver rollos disponibles, buscar por código de barra o rollo' },
      { key: 'inventoryAdd', label: 'Ingreso Manual de Rollos', description: 'Registrar rollos individuales recibidos' },
      { key: 'inventoryBulkImport', label: 'Carga Masiva desde Excel', description: 'Pegar e importar lotes de rollos desde hojas de cálculo' },
      { key: 'inventoryAdjust', label: 'Ajuste de Metrajes', description: 'Modificar metraje remanente de rollos existentes' },
      { key: 'inventoryDelete', label: 'Anular o Dar de Baja Rollos', description: 'Eliminar rollos físicos del inventario' }
    ]
  },
  {
    name: 'Notas de Venta / Pedidos',
    description: 'Creación y seguimiento de órdenes comerciales',
    permissions: [
      { key: 'salesOrdersCreate', label: 'Crear Notas de Venta', description: 'Emitir nuevas órdenes y fichas de venta' },
      { key: 'salesOrdersView', label: 'Ver Historial de Pedidos', description: 'Consultar fichas emitidas y estados de entrega' },
      { key: 'salesOrdersPrint', label: 'Imprimir Notas de Venta', description: 'Generar comprobante impreso para despacho' }
    ]
  },
  {
    name: 'Catálogos y Tablas Maestras',
    description: 'Gestión de maestros del negocio',
    permissions: [
      { key: 'manageArticles', label: 'Gestionar Telas / Artículos', description: 'Crear, editar o desactivar artículos y telas' },
      { key: 'manageProviders', label: 'Gestionar Proveedores', description: 'Configurar proveedores y reglas de partida/lote' },
      { key: 'manageClients', label: 'Gestionar Clientes', description: 'Registrar y editar clientes con RUC/DNI y direcciones' },
      { key: 'manageSellers', label: 'Gestionar Vendedores', description: 'Administrar el equipo de ventas' }
    ]
  },
  {
    name: 'Seguridad y Administración',
    description: 'Control de accesos y configuración global',
    permissions: [
      { key: 'manageUsers', label: 'Gestión de Usuarios', description: 'Crear usuarios, asignar claves y configurar permisos' },
      { key: 'systemConfig', label: 'Configuración de Sistema', description: 'Correlativos y parámetros generales' },
      { key: 'testModeAccess', label: 'Acceso a Modo Prueba', description: 'Permite activar o desactivar el simulador de prueba' }
    ]
  }
];

export const ROLE_PRESETS: Record<UserRole, { label: string; description: string; permissions: UserPermissions }> = {
  admin: {
    label: 'Administrador General',
    description: 'Control total de la plataforma, usuarios, inventario y ventas',
    permissions: {
      packingListCreate: true,
      packingListHistory: true,
      packingListCancel: true,
      packingListPrint: true,
      packingListExport: true,
      inventoryView: true,
      inventoryAdd: true,
      inventoryBulkImport: true,
      inventoryAdjust: true,
      inventoryDelete: true,
      salesOrdersCreate: true,
      salesOrdersView: true,
      salesOrdersPrint: true,
      manageArticles: true,
      manageProviders: true,
      manageClients: true,
      manageSellers: true,
      manageUsers: true,
      systemConfig: true,
      testModeAccess: true
    }
  },
  supervisor: {
    label: 'Supervisor de Operaciones',
    description: 'Supervisión completa de almacén y ventas, sin administración de usuarios',
    permissions: {
      packingListCreate: true,
      packingListHistory: true,
      packingListCancel: true,
      packingListPrint: true,
      packingListExport: true,
      inventoryView: true,
      inventoryAdd: true,
      inventoryBulkImport: true,
      inventoryAdjust: true,
      inventoryDelete: false,
      salesOrdersCreate: true,
      salesOrdersView: true,
      salesOrdersPrint: true,
      manageArticles: true,
      manageProviders: false,
      manageClients: true,
      manageSellers: true,
      manageUsers: false,
      systemConfig: false,
      testModeAccess: true
    }
  },
  almacen: {
    label: 'Operador de Almacén',
    description: 'Despachos, escaneo de rollos, control de stock y packing lists',
    permissions: {
      packingListCreate: true,
      packingListHistory: true,
      packingListCancel: false,
      packingListPrint: true,
      packingListExport: true,
      inventoryView: true,
      inventoryAdd: true,
      inventoryBulkImport: true,
      inventoryAdjust: true,
      inventoryDelete: false,
      salesOrdersCreate: false,
      salesOrdersView: true,
      salesOrdersPrint: true,
      manageArticles: false,
      manageProviders: false,
      manageClients: true,
      manageSellers: false,
      manageUsers: false,
      systemConfig: false,
      testModeAccess: false
    }
  },
  vendedor: {
    label: 'Agente de Ventas',
    description: 'Emisión de notas de venta, consulta de stock disponible y clientes',
    permissions: {
      packingListCreate: false,
      packingListHistory: true,
      packingListCancel: false,
      packingListPrint: true,
      packingListExport: false,
      inventoryView: true,
      inventoryAdd: false,
      inventoryBulkImport: false,
      inventoryAdjust: false,
      inventoryDelete: false,
      salesOrdersCreate: true,
      salesOrdersView: true,
      salesOrdersPrint: true,
      manageArticles: false,
      manageProviders: false,
      manageClients: true,
      manageSellers: false,
      manageUsers: false,
      systemConfig: false,
      testModeAccess: false
    }
  },
  custom: {
    label: 'Personalizado',
    description: 'Permisos seleccionados a medida por el administrador',
    permissions: {
      packingListCreate: true,
      packingListHistory: true,
      packingListCancel: false,
      packingListPrint: true,
      packingListExport: false,
      inventoryView: true,
      inventoryAdd: false,
      inventoryBulkImport: false,
      inventoryAdjust: false,
      inventoryDelete: false,
      salesOrdersCreate: false,
      salesOrdersView: false,
      salesOrdersPrint: false,
      manageArticles: false,
      manageProviders: false,
      manageClients: false,
      manageSellers: false,
      manageUsers: false,
      systemConfig: false,
      testModeAccess: false
    }
  }
};
