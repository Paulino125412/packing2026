import React, { useState, useEffect } from 'react';
import { 
  db, 
  seedDatabaseIfEmpty, 
  handleFirestoreError, 
  OperationType,
  getLocalMode,
  setLocalMode,
  getLocalStorageCollection,
  seedLocalStorage,
  syncLocalDataToCloud
} from './firebase';
import { collection, onSnapshot, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Client, Seller, Provider, Article, RollItem, PackingList } from './types';

// Icons
import { 
  FileText, 
  History, 
  Layers, 
  Settings, 
  User, 
  Warehouse, 
  Activity, 
  HelpCircle,
  Truck,
  RotateCcw,
  CloudLightning,
  RefreshCw,
  Sun,
  Moon,
  Search,
  Download,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  PanelLeft,
  Menu,
  X
} from 'lucide-react';

// Components
import PackingListForm from './components/PackingListForm';
import PackingListHistory from './components/PackingListHistory';
import InventoryManager from './components/InventoryManager';
import CatalogManager from './components/CatalogManager';
import SalesOrderManager from './components/SalesOrderManager';
import AlertBanner from './components/AlertBanner';
import PrintPackingList from './components/PrintPackingList';
import QuickSearchPalette from './components/QuickSearchPalette';
import DevRulesMonitor from './components/DevRulesMonitor';

type AppTab = 'generate' | 'history' | 'inventory' | 'catalogs' | 'sales_order';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('generate');
  const [currentOperator, setCurrentOperator] = useState('Paul Almacén');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('wms-theme') as 'light' | 'dark') || 'light';
  });

  // Collapsible Sidebar States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('texflow_sidebar_collapsed') === 'true';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const isSidebarExpanded = !isSidebarCollapsed || isSidebarHovered;

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('texflow_sidebar_collapsed', String(next));
      return next;
    });
    setIsSidebarHovered(false);
  };

  useEffect(() => {
    localStorage.setItem('wms-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Database States
  const [clients, setClients] = useState<Client[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [inventory, setInventory] = useState<RollItem[]>([]);
  const [inventoryLimit, setInventoryLimit] = useState(200);
  const [inventoryHasMore, setInventoryHasMore] = useState(false);
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);

  // Print Modal State
  const [selectedPrintList, setSelectedPrintList] = useState<PackingList | null>(null);

  // Edit & Duplicate States
  const [editingPackingList, setEditingPackingList] = useState<PackingList | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Quick Search States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [catalogInitialTab, setCatalogInitialTab] = useState<'clients' | 'articles' | 'providers' | 'sellers' | undefined>(undefined);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');

  // Handle manual sidebar tab changes (clears search query preset)
  const handleTabChange = (tab: AppTab) => {
    setCatalogInitialTab(undefined);
    setCatalogSearchQuery('');
    setHistorySearchQuery('');
    setInventorySearchQuery('');
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  // Keyboard shortcut for Ctrl+K and Escape to close modals/views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSelectedPrintList(null);
        setShowConnectionErrorModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectSearchResult = (type: 'client' | 'article' | 'packing_list' | 'inventory', item: any) => {
    if (type === 'client') {
      setCatalogInitialTab('clients');
      setCatalogSearchQuery(item.name);
      setActiveTab('catalogs');
    } else if (type === 'article') {
      setCatalogInitialTab('articles');
      setCatalogSearchQuery(item.name);
      setActiveTab('catalogs');
    } else if (type === 'packing_list') {
      setHistorySearchQuery(item.packingListNo);
      setActiveTab('history');
    } else if (type === 'inventory') {
      setInventorySearchQuery(item.rollNumber);
      setActiveTab('inventory');
    }
  };

  // loading state
  const [loading, setLoading] = useState(true);
  const [isLocal, setIsLocal] = useState(getLocalMode());
  const [showConnectionErrorModal, setShowConnectionErrorModal] = useState(false);
  const [connectionErrorReason, setConnectionErrorReason] = useState<string | null>(null);

  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResultModal, setSyncResultModal] = useState<{
    isOpen: boolean;
    success: boolean;
    message: string;
    counts?: {
      providers: number;
      articles: number;
      clients: number;
      sellers: number;
      inventory: number;
      packinglists: number;
    };
  } | null>(null);

  useEffect(() => {
    const collections = ['providers', 'articles', 'clients', 'sellers', 'inventory', 'packinglists'];
    const hasPending = collections.some(col => {
      const items = getLocalStorageCollection(col);
      return items.some((item: any) => item.id && String(item.id).startsWith('local-'));
    });
    setHasPendingSync(hasPending);
  }, [isLocal, clients, sellers, providers, articles, inventory, packingLists]);

  const handleSyncLocalData = async () => {
    setIsSyncing(true);
    try {
      const result = await syncLocalDataToCloud();
      if (result.success) {
        setSyncResultModal({
          isOpen: true,
          success: true,
          message: '¡Los datos creados en modo local se han sincronizado exitosamente con la nube!',
          counts: result.uploadedCounts
        });
      } else {
        setSyncResultModal({
          isOpen: true,
          success: false,
          message: result.error || 'Ocurrió un error inesperado al intentar sincronizar los datos.'
        });
      }
    } catch (err: any) {
      setSyncResultModal({
        isOpen: true,
        success: false,
        message: `Fallo inesperado: ${err?.message || err}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadLocalData = () => {
    seedLocalStorage();
    setClients(getLocalStorageCollection('clients'));
    setSellers(getLocalStorageCollection('sellers'));
    setProviders(getLocalStorageCollection('providers'));
    setArticles(getLocalStorageCollection('articles'));
    setInventory(getLocalStorageCollection('inventory'));
    setPackingLists(getLocalStorageCollection('packinglists'));
    setIsLocal(true);
    setLocalMode(true);
    setLoading(false);
  };

  const handleChooseLocalMode = () => {
    setShowConnectionErrorModal(false);
    loadLocalData();
  };

  const handleTryConnectCloud = () => {
    setLocalMode(false);
    setIsLocal(false);
    setLoading(true);
    window.location.reload();
  };

  // Trigger Database Seed + Firestore listeners
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let timeoutId: any = null;
    let fallbackTriggered = false;

    const triggerFallback = (reason: string) => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      console.warn(`Connection issue detected: ${reason}`);
      
      // Clear timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // Unsubscribe from any active listeners
      unsubs.forEach(unsub => {
        try { unsub(); } catch(e) {}
      });
      unsubs = [];
      
      setConnectionErrorReason(reason);
      setLoading(false);

      // Show connection modal if user wasn't explicitly in local mode
      if (!getLocalMode()) {
        setShowConnectionErrorModal(true);
      } else {
        loadLocalData();
      }
    };

    async function initDb() {
      // Always pre-seed local storage so fallback is instant if needed
      seedLocalStorage();

      // Check user's preferred or current local mode
      if (getLocalMode()) {
        triggerFallback("User previously active in Local Mode");
        return;
      }

      // Safety timeout: if Firestore takes too long to load (e.g., initial DB setup latency),
      // fallback to local storage so user doesn't get stuck on loading screen
      timeoutId = setTimeout(() => {
        triggerFallback("Firestore connection timeout (8 seconds)");
      }, 8000);

      try {
        // Seed first to prevent empty dashboard
        await seedDatabaseIfEmpty();
        
        // Start Realtime Firestore Observers
        const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
          const list: Client[] = [];
          snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Client));
          setClients(list);
        }, (error: any) => {
          console.error("Firestore Clients error:", error);
          if (error?.code === 'permission-denied') {
            triggerFallback("Clients Permission Denied / Error");
          }
        });
        unsubs.push(unsubClients);

        const unsubSellers = onSnapshot(collection(db, 'sellers'), (snapshot) => {
          const list: Seller[] = [];
          snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Seller));
          setSellers(list);
        }, (error: any) => {
          console.error("Firestore Sellers error:", error);
          if (error?.code === 'permission-denied') {
            triggerFallback("Sellers Permission Denied / Error");
          }
        });
        unsubs.push(unsubSellers);

        const unsubProviders = onSnapshot(collection(db, 'providers'), (snapshot) => {
          const list: Provider[] = [];
          snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Provider));
          setProviders(list);
        }, (error: any) => {
          console.error("Firestore Providers error:", error);
          if (error?.code === 'permission-denied') {
            triggerFallback("Providers Permission Denied / Error");
          }
        });
        unsubs.push(unsubProviders);

        const unsubArticles = onSnapshot(collection(db, 'articles'), (snapshot) => {
          const list: Article[] = [];
          snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Article));
          setArticles(list);
        }, (error: any) => {
          console.error("Firestore Articles error:", error);
          if (error?.code === 'permission-denied') {
            triggerFallback("Articles Permission Denied / Error");
          }
        });
        unsubs.push(unsubArticles);

        const unsubPackingLists = onSnapshot(collection(db, 'packinglists'), (snapshot) => {
          const list: PackingList[] = [];
          snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as PackingList));
          setPackingLists(list);
        }, (error: any) => {
          console.error("Firestore Packinglists error:", error);
          if (error?.code === 'permission-denied') {
            triggerFallback("Packinglists Permission Denied / Error");
          }
        });
        unsubs.push(unsubPackingLists);

        // If we reach here successfully and didn't trigger fallback yet
        if (!fallbackTriggered) {
          clearTimeout(timeoutId);
          setIsLocal(false);
          setLocalMode(false);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error initializing Firestore DB:", error);
        triggerFallback("Firestore Seed/Init failed");
      }
    }

    initDb();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubs.forEach(unsub => {
        try { unsub(); } catch(e) {}
      });
    };
  }, []);

  // Separate independent effect for Inventory collection with limit
  useEffect(() => {
    if (getLocalMode?.() || isLocal) return;
    const unsubInventory = onSnapshot(
      query(collection(db, 'inventory'), orderBy('createdAt', 'desc'), limit(inventoryLimit)),
      (snapshot) => {
        const list: RollItem[] = [];
        snapshot.forEach(doc => list.push({ ...doc.data(), id: doc.id } as RollItem));
        setInventory(list);
        setInventoryHasMore(list.length === inventoryLimit);
      },
      (error) => {
        console.error("Firestore Inventory error:", error);
      }
    );
    return () => unsubInventory();
  }, [inventoryLimit, isLocal]);

  // Refresh helper (mostly handled by onSnapshot, but triggers full check)
  const handleForceRefresh = async () => {
    setLoading(true);
    if (getLocalMode() || isLocal) {
      loadLocalData();
    } else {
      try {
        await seedDatabaseIfEmpty();
        setConnectionErrorReason(null);
      } catch (e: any) {
        console.error(e);
        const reasonStr = `Error al refrescar conexión: ${e?.message || e}`;
        setConnectionErrorReason(reasonStr);
        loadLocalData();
        setShowConnectionErrorModal(true);
      } finally {
        setLoading(false);
      }
    }
  };

  const getActiveTabComponent = () => {
    switch (activeTab) {
      case 'generate':
        return (
          <PackingListForm
            clients={clients}
            sellers={sellers}
            providers={providers}
            articles={articles}
            inventory={inventory}
            packingLists={packingLists}
            inventoryHasMore={inventoryHasMore}
            onRefresh={handleForceRefresh}
            onPackingListCreated={(pl) => {
              setSelectedPrintList(pl);
              setEditingPackingList(null);
              setIsDuplicate(false);
            }}
            currentOperator={currentOperator}
            editingPackingList={editingPackingList}
            isDuplicate={isDuplicate}
            onCancelEdit={(goToHistory = true) => {
              setEditingPackingList(null);
              setIsDuplicate(false);
              if (goToHistory) {
                setActiveTab('history');
              }
            }}
          />
        );
      case 'history':
        return (
          <PackingListHistory
            packingLists={packingLists}
            clients={clients}
            sellers={sellers}
            providers={providers}
            articles={articles}
            inventory={inventory}
            onRefresh={handleForceRefresh}
            onSelectPrint={(pl) => setSelectedPrintList(pl)}
            onEdit={(pl) => {
              setEditingPackingList(pl);
              setIsDuplicate(false);
              setActiveTab('generate');
            }}
            initialSearchTerm={historySearchQuery}
            onCreateNew={() => setActiveTab('generate')}
          />
        );
      case 'inventory':
        return (
          <InventoryManager
            inventory={inventory}
            providers={providers}
            articles={articles}
            onRefresh={handleForceRefresh}
            currentOperator={currentOperator}
            initialSearchTerm={inventorySearchQuery}
            hasMore={inventoryHasMore}
            onLoadMore={() => setInventoryLimit(prev => prev + 200)}
          />
        );
      case 'catalogs':
        return (
          <CatalogManager
            clients={clients}
            sellers={sellers}
            providers={providers}
            articles={articles}
            packingLists={packingLists}
            inventory={inventory}
            onRefresh={handleForceRefresh}
            initialTab={catalogInitialTab}
            initialSearchQuery={catalogSearchQuery}
          />
        );
      case 'sales_order':
        return (
          <SalesOrderManager
            clients={clients}
            sellers={sellers}
            articles={articles}
            currentOperator={currentOperator}
          />
        );
      default:
        return null;
    }
  };

  const getFormattedDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${minutes}`;
  };

  const handleDownloadBackup = () => {
    const backupData = {
      backupDate: new Date().toISOString(),
      providers,
      articles,
      clients,
      sellers,
      inventory,
      packingLists
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_texflow_${getFormattedDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div translate="no" className={`h-screen bg-app-bg text-app-text flex flex-col md:flex-row font-sans select-none antialiased notranslate overflow-hidden ${theme === 'dark' ? 'dark' : ''}`}>
      
      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-Over Navigation Drawer */}
      <aside 
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#F5F3EE] dark:bg-[#14201F] text-app-text z-50 shadow-2xl flex flex-col md:hidden border-r border-app-border/60 transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Header with Brand & Close Button */}
        <div className="p-4 border-b border-app-border/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-app-surface border border-app-border p-2 rounded-md text-app-text shadow-xs shrink-0">
              <Warehouse size={18} className="stroke-[1.5]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-bold tracking-wider text-app-text uppercase leading-none truncate">Control Almacén</h1>
              <span className="text-[9px] text-app-text/60 font-mono uppercase tracking-widest mt-1 block truncate">WMS Enterprise</span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 hover:bg-app-surface border border-app-border/40 rounded-md text-app-text/70 hover:text-app-text transition cursor-pointer"
            title="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mobile Status Indicators */}
        <div className="px-4 py-3 border-b border-app-border/25 bg-app-surface/20 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] font-medium text-app-text/75">
            <span>Servidor de Datos:</span>
            {isLocal ? (
              <span className="inline-flex items-center gap-1.5 text-app-primary font-semibold text-[10px] bg-app-primary/10 px-2 py-0.5 rounded border border-app-primary/20">
                <span className="h-1.5 w-1.5 rounded-full bg-app-primary animate-pulse"></span>
                Demo Local
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-app-secondary font-semibold text-[10px] bg-app-secondary/10 px-2 py-0.5 rounded border border-app-secondary/20">
                <span className="h-1.5 w-1.5 rounded-full bg-app-secondary"></span>
                Sincronizado
              </span>
            )}
          </div>
          <div className="text-[10px] text-app-text/50 font-mono flex items-center justify-between">
            <span>Terminal: wms-client</span>
            <span>v2.6r</span>
          </div>
        </div>

        {/* Mobile Nav Links */}
        <nav className="flex-1 min-h-0 p-3 space-y-1.5 overflow-y-auto">
          <div className="text-[9px] font-bold text-app-text/50 uppercase tracking-widest px-2 mb-2">
            Módulos del Sistema
          </div>

          <button
            onClick={() => handleTabChange('generate')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition cursor-pointer min-h-[44px] ${
              activeTab === 'generate'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/75 hover:text-app-text hover:bg-app-primary/10'
            }`}
          >
            <FileText size={18} className={activeTab === 'generate' ? 'text-white' : 'text-app-text/60'} />
            <span className="truncate">NUEVO PACKING LIST</span>
          </button>

          <button
            onClick={() => handleTabChange('history')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition cursor-pointer min-h-[44px] ${
              activeTab === 'history'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/75 hover:text-app-text hover:bg-app-primary/10'
            }`}
          >
            <History size={18} className={activeTab === 'history' ? 'text-white' : 'text-app-text/60'} />
            <span className="truncate">HISTORIAL DE DESPACHOS</span>
          </button>

          <button
            onClick={() => handleTabChange('inventory')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition cursor-pointer min-h-[44px] ${
              activeTab === 'inventory'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/75 hover:text-app-text hover:bg-app-primary/10'
            }`}
          >
            <Warehouse size={18} className={activeTab === 'inventory' ? 'text-white' : 'text-app-text/60'} />
            <span className="truncate">INVENTARIO</span>
          </button>

          <button
            onClick={() => handleTabChange('catalogs')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition cursor-pointer min-h-[44px] ${
              activeTab === 'catalogs'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/75 hover:text-app-text hover:bg-app-primary/10'
            }`}
          >
            <Settings size={18} className={activeTab === 'catalogs' ? 'text-white' : 'text-app-text/60'} />
            <span className="truncate">CATÁLOGOS</span>
          </button>

          <button
            onClick={() => handleTabChange('sales_order')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition cursor-pointer min-h-[44px] ${
              activeTab === 'sales_order'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/75 hover:text-app-text hover:bg-app-primary/10'
            }`}
          >
            <ClipboardList size={18} className={activeTab === 'sales_order' ? 'text-white' : 'text-app-text/60'} />
            <span className="truncate">ÓRDENES DE VENTA</span>
          </button>
        </nav>

        {/* Mobile Quick Connection Action */}
        {isLocal && (
          <div className="p-3 m-3 bg-app-primary/5 border border-app-primary/20 rounded-md text-xs text-app-text/80 flex flex-col gap-2 shrink-0">
            <p className="leading-tight text-[10px] text-app-primary">
              <strong>Modo Local Activo:</strong> Los datos se almacenan en este dispositivo.
            </p>
            <button 
              onClick={handleTryConnectCloud}
              className="w-full py-2 bg-app-primary hover:bg-app-primary/90 text-white font-semibold rounded text-[11px] transition uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer min-h-[38px]"
            >
              <RefreshCw size={12} className="animate-spin-slow" />
              Sincronizar Nube
            </button>
          </div>
        )}

        {/* Mobile Operator Selector Section */}
        <div className="p-3.5 border-t border-app-border/45 bg-app-surface/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded bg-app-surface border border-app-border flex items-center justify-center text-app-text/70 shrink-0">
              <User size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[8px] uppercase font-bold tracking-widest text-app-text/50">Operario Actual</span>
              <select
                value={currentOperator}
                onChange={e => setCurrentOperator(e.target.value)}
                className="bg-transparent text-xs font-medium text-app-text focus:outline-hidden cursor-pointer w-full text-left truncate -ml-0.5 mt-0.5 border-none p-0 focus:ring-0"
              >
                <option value="Paul Almacén" className="bg-app-surface text-app-text">Paul (Almacén Central)</option>
                <option value="Administrador" className="bg-app-surface text-app-text">Administrador de Red</option>
                <option value="Operador Turno Mañana" className="bg-app-surface text-app-text">Operador Turno Mañana</option>
                <option value="Despachador Principal" className="bg-app-surface text-app-text">Despachador Principal</option>
              </select>
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop Sidebar Navigation (Hidden on Mobile) */}
      <aside 
        onMouseEnter={() => {
          if (isSidebarCollapsed) setIsSidebarHovered(true);
        }}
        onMouseLeave={() => {
          if (isSidebarHovered) setIsSidebarHovered(false);
        }}
        className={`hidden md:flex ${
          isSidebarExpanded ? 'md:w-64' : 'md:w-16'
        } transition-all duration-300 ease-in-out bg-[#F5F3EE] dark:bg-[#14201F] text-app-text flex-col shrink-0 border-r border-app-border/60 no-print overflow-y-auto overflow-x-hidden ${
          isSidebarCollapsed && isSidebarHovered ? 'shadow-2xl z-40' : ''
        }`}
      >
        {/* Brand / Logo Header */}
        <div className={`p-4 ${isSidebarExpanded ? 'px-5 py-5' : 'px-2 py-4'} border-b border-app-border/40 flex items-center ${isSidebarExpanded ? 'justify-between' : 'justify-center'} shrink-0 transition-all`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div 
              onClick={() => {
                if (!isSidebarExpanded) toggleSidebarCollapse();
              }}
              className="bg-app-surface border border-app-border p-2 rounded-md text-app-text shadow-xs shrink-0 cursor-pointer"
              title={!isSidebarExpanded ? "Haga clic para expandir menú" : "Control Almacén"}
            >
              <Warehouse size={18} className="stroke-[1.5]" />
            </div>
            {isSidebarExpanded && (
              <div className="min-w-0 animate-fadeIn">
                <h1 className="text-xs font-bold tracking-wider text-app-text uppercase leading-none truncate">Control Almacén</h1>
                <span className="text-[9px] text-app-text/60 font-mono uppercase tracking-widest mt-1 block truncate">WMS Enterprise</span>
              </div>
            )}
          </div>

          {/* Dedicated Toggle / Pin button inside sidebar */}
          {isSidebarExpanded && (
            <button
              onClick={toggleSidebarCollapse}
              className="p-1.5 hover:bg-app-surface border border-transparent hover:border-app-border rounded-md text-app-text/60 hover:text-app-text transition cursor-pointer shrink-0 ml-1"
              title={isSidebarCollapsed ? "Fijar menú lateral abierto" : "Ocultar / Colapsar menú lateral"}
              id="sidebar-collapse-toggle-btn"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {/* Status Indicators Integrated in Sidebar */}
        <div className={`${isSidebarExpanded ? 'px-5 py-3.5' : 'py-3 px-1'} border-b border-app-border/25 bg-app-surface/20 flex flex-col gap-2 shrink-0 transition-all`}>
          {isSidebarExpanded ? (
            <>
              <div className="flex items-center justify-between text-[11px] font-medium text-app-text/75 animate-fadeIn">
                <span>Servidor de Datos:</span>
                {isLocal ? (
                  <span className="inline-flex items-center gap-1.5 text-app-primary font-semibold text-[10px] bg-app-primary/10 px-2 py-0.5 rounded border border-app-primary/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-app-primary animate-pulse"></span>
                    Demo Local
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-app-secondary font-semibold text-[10px] bg-app-secondary/10 px-2 py-0.5 rounded border border-app-secondary/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-app-secondary"></span>
                    Sincronizado
                  </span>
                )}
              </div>
              <div className="text-[10px] text-app-text/50 font-mono flex items-center justify-between animate-fadeIn">
                <span>Terminal: wms-client</span>
                <span>v2.6r</span>
              </div>
            </>
          ) : (
            <div 
              className="flex justify-center items-center" 
              title={isLocal ? "Servidor: Demo Local" : "Servidor: Sincronizado con la Nube"}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${isLocal ? 'bg-app-primary animate-pulse' : 'bg-app-secondary'} ring-4 ring-app-surface`} />
            </div>
          )}
        </div>

        {/* Sidebar Nav Links */}
        <nav className={`flex-1 min-h-0 ${isSidebarExpanded ? 'p-3.5 space-y-1' : 'p-2 space-y-2'} overflow-y-auto overflow-x-hidden transition-all`}>
          {isSidebarExpanded && (
            <div className="text-[9px] font-bold text-app-text/50 uppercase tracking-widest px-2 mb-2 animate-fadeIn">
              Módulos del Sistema
            </div>
          )}

          <button
            onClick={() => handleTabChange('generate')}
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-3 py-2 justify-start' : 'justify-center p-2.5'} rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === 'generate'
                ? 'bg-app-primary text-white border-l-2 border-app-primary shadow-xs'
                : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10'
            }`}
            id="tab-generate"
            title="NUEVO PACKING LIST"
          >
            <FileText size={16} className={activeTab === 'generate' ? 'text-white' : 'text-app-text/50'} />
            {isSidebarExpanded && <span className="truncate">NUEVO PACKING LIST</span>}
          </button>

          <button
            onClick={() => handleTabChange('history')}
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-3 py-2 justify-start' : 'justify-center p-2.5'} rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-app-primary text-white border-l-2 border-app-primary shadow-xs'
                : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10'
            }`}
            id="tab-history"
            title="HISTORIAL DE DESPACHOS"
          >
            <History size={16} className={activeTab === 'history' ? 'text-white' : 'text-app-text/50'} />
            {isSidebarExpanded && <span className="truncate">HISTORIAL DE DESPACHOS</span>}
          </button>

          <button
            onClick={() => handleTabChange('inventory')}
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-3 py-2 justify-start' : 'justify-center p-2.5'} rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-app-primary text-white border-l-2 border-app-primary shadow-xs'
                : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10'
            }`}
            id="tab-inventory"
            title="INVENTARIO"
          >
            <Warehouse size={16} className={activeTab === 'inventory' ? 'text-white' : 'text-app-text/50'} />
            {isSidebarExpanded && <span className="truncate">INVENTARIO</span>}
          </button>

          <button
            onClick={() => handleTabChange('catalogs')}
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-3 py-2 justify-start' : 'justify-center p-2.5'} rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === 'catalogs'
                ? 'bg-app-primary text-white border-l-2 border-app-primary shadow-xs'
                : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10'
            }`}
            id="tab-catalogs"
            title="CATÁLOGOS"
          >
            <Settings size={16} className={activeTab === 'catalogs' ? 'text-white' : 'text-app-text/50'} />
            {isSidebarExpanded && <span className="truncate">CATÁLOGOS</span>}
          </button>

          <button
            onClick={() => handleTabChange('sales_order')}
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-3 py-2 justify-start' : 'justify-center p-2.5'} rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
              activeTab === 'sales_order'
                ? 'bg-app-primary text-white border-l-2 border-app-primary shadow-xs'
                : 'text-app-text/60 hover:text-app-text hover:bg-app-primary/10'
            }`}
            id="tab-sales-order"
            title="ÓRDENES DE VENTA"
          >
            <ClipboardList size={16} className={activeTab === 'sales_order' ? 'text-white' : 'text-app-text/50'} />
            {isSidebarExpanded && <span className="truncate">ÓRDENES DE VENTA</span>}
          </button>
        </nav>

        {/* Quick Connection Action for Local DemoFallback */}
        {isLocal && isSidebarExpanded && (
          <div className="p-3.5 m-3 bg-app-primary/5 border border-app-primary/20 rounded-md text-xs text-app-text/80 flex flex-col gap-2 shrink-0 animate-fadeIn">
            <p className="leading-tight text-[10px] text-app-primary">
              <strong>Modo Local Activo:</strong> Los datos se almacenan de manera local en el navegador.
            </p>
            <button 
              onClick={handleTryConnectCloud}
              className="w-full py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-semibold rounded text-[10px] transition uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
            >
              <RefreshCw size={10} className="animate-spin-slow" />
              Sincronizar Nube
            </button>
          </div>
        )}

        {/* Operator Selector Section - Embedded in Sidebar Footer */}
        <div className={`${isSidebarExpanded ? 'p-4' : 'p-2 py-3 flex justify-center'} border-t border-app-border/45 bg-app-surface/20 shrink-0 transition-all`}>
          <div className={`flex items-center ${isSidebarExpanded ? 'gap-2.5' : 'justify-center'}`}>
            <div 
              className="h-7 w-7 rounded bg-app-surface border border-app-border flex items-center justify-center text-app-text/70 shrink-0"
              title={`Operario: ${currentOperator}`}
            >
              <User size={13} />
            </div>
            {isSidebarExpanded && (
              <div className="flex-1 min-w-0 animate-fadeIn">
                <span className="block text-[8px] uppercase font-bold tracking-widest text-app-text/50">Operario Actual</span>
                <select
                  value={currentOperator}
                  onChange={e => setCurrentOperator(e.target.value)}
                  className="bg-transparent text-[11px] font-medium text-app-text focus:outline-hidden cursor-pointer w-full text-left truncate -ml-0.5 mt-0.5 border-none p-0 focus:ring-0"
                  id="select-operator-user"
                >
                  <option value="Paul Almacén" className="bg-app-surface text-app-text">Paul (Almacén Central)</option>
                  <option value="Administrador" className="bg-app-surface text-app-text">Administrador de Red</option>
                  <option value="Operador Turno Mañana" className="bg-app-surface text-app-text">Operador Turno Mañana</option>
                  <option value="Despachador Principal" className="bg-app-surface text-app-text">Despachador Principal</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Container - Structured Workspace (Takes 100% full screen on mobile) */}
      <div className={`flex-1 min-w-0 bg-app-bg flex flex-col h-full overflow-hidden ${theme === 'dark' ? 'dark' : ''} ${selectedPrintList ? 'no-print' : ''}`}>
        
        {/* Top Header Bar (no-print) - Static & Compact */}
        <header className="sticky top-0 z-30 bg-app-surface/95 backdrop-blur-md border-b border-app-border px-3 sm:px-6 py-2.5 sm:py-3.5 flex justify-between items-center gap-2 sm:gap-3 no-print shrink-0 shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-app-bg text-app-text/80 hover:text-app-text border border-app-border rounded-md transition flex md:hidden items-center justify-center cursor-pointer shadow-2xs shrink-0 min-h-[38px] min-w-[38px]"
              title="Abrir menú de navegación"
              id="mobile-menu-open-btn"
            >
              <Menu size={18} />
            </button>

            {/* Desktop Sidebar Toggle Button */}
            <button
              onClick={toggleSidebarCollapse}
              className="p-1.5 hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded-md transition hidden md:flex items-center justify-center cursor-pointer shadow-2xs shrink-0"
              title={isSidebarCollapsed ? "Mostrar / Expandir panel lateral fijo" : "Ocultar / Colapsar panel lateral"}
              id="global-sidebar-toggle-btn"
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="min-w-0">
              <div className="text-[8px] sm:text-[9px] font-bold text-app-text/50 uppercase tracking-widest truncate">
                SISTEMA DE CONTROL Y DESPACHOS
              </div>
              <h2 className="text-sm sm:text-base font-bold text-app-text tracking-tight mt-0.5 truncate">
                {activeTab === 'generate' && "Nuevo Packing List"}
                {activeTab === 'history' && "Historial de Despachos"}
                {activeTab === 'inventory' && "Inventario"}
                {activeTab === 'catalogs' && "Catálogos"}
                {activeTab === 'sales_order' && "Órdenes de Venta"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Developer Business Rules & Health Monitor */}
            <DevRulesMonitor data={{ inventory, packingLists, articles, providers, clients, sellers }} />

            {/* Quick Search Trigger Button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-1.5 sm:p-1.5 hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition flex items-center justify-center cursor-pointer gap-1.5 px-2 sm:px-2.5 min-h-[34px]"
              title="Buscar (Ctrl+K)"
              id="global-search-trigger-btn"
            >
              <Search size={14} />
              <span className="text-[10px] font-bold text-app-text/50 hidden md:inline font-mono">Ctrl+K</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-1.5 hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition flex items-center justify-center cursor-pointer min-h-[34px] min-w-[34px]"
              title={theme === 'light' ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
              id="theme-toggle-btn"
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>

            <button
              onClick={handleForceRefresh}
              className="p-1.5 hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer"
              title="Sincronizar base de datos"
            >
              <RefreshCw size={13} className={loading ? "animate-spin text-app-secondary" : ""} />
            </button>
            
            <div className="text-right hidden sm:block font-mono text-[10px] text-app-text/50 border-l border-app-border pl-3">
              {new Date().toLocaleDateString('es-ES', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Content Body Wrapper */}
        <main className="flex-1 min-h-0 p-6 overflow-y-auto space-y-4">
          {connectionErrorReason && (
            <AlertBanner
              type="warning"
              message={`No se pudo conectar a la nube de Firestore. Motivo: ${connectionErrorReason}`}
              onClose={() => setConnectionErrorReason(null)}
            />
          )}

          {loading ? (
            <div className="flex flex-col justify-center items-center h-80 gap-3 bg-app-surface border border-app-border rounded-lg p-8 shadow-xs">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-app-secondary"></div>
              <p className="text-xs font-semibold text-app-text">Sincronizando base de datos en tiempo real...</p>
              <p className="text-[10px] text-app-text/50 font-mono">Cargando módulos de WMS Enterprise</p>
            </div>
          ) : (
            getActiveTabComponent()
          )}
        </main>

        {/* High Density Status Bar - Bottom (no-print) */}
        <footer className="bg-app-surface text-app-text/50 px-6 py-2.5 text-[9px] flex flex-wrap justify-between items-center border-t border-app-border no-print font-mono">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="h-1.5 w-1.5 rounded-full bg-app-secondary animate-pulse"></span>
            WMS Mode: {isLocal ? "Local Demo Offline" : "Firestore Production DB"} • LiveSync • TLS Secure
            <button
              onClick={handleDownloadBackup}
              className="ml-3 px-2 py-0.5 bg-app-primary hover:bg-app-primary/95 text-white font-semibold rounded text-[8px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition duration-150 shadow-xs border border-app-primary"
              title="Descargar un respaldo completo de la base de datos en formato JSON"
            >
              <Download size={8} />
              Descargar Respaldo Completo
            </button>
            {isLocal && hasPendingSync && (
              <button
                onClick={handleSyncLocalData}
                disabled={isSyncing}
                className="ml-3 px-2 py-0.5 bg-app-primary hover:bg-app-primary/95 text-white font-semibold rounded text-[8px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition duration-150 disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw size={8} className="animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <CloudLightning size={8} />
                    Subir Datos Locales a la Nube
                  </>
                )}
              </button>
            )}
          </span>
          <span className="uppercase tracking-wider">
            © 2026 Sistema WMS • Almacén y Logística
          </span>
        </footer>
      </div>

      {/* Printable Dual Copy Popup Modal Overlay */}
      {selectedPrintList && (
        <PrintPackingList
          packingList={selectedPrintList}
          clients={clients}
          sellers={sellers}
          providers={providers}
          articles={articles}
          onClose={() => setSelectedPrintList(null)}
          onEdit={(pl) => {
            setSelectedPrintList(null);
            setEditingPackingList(pl);
            setIsDuplicate(false);
            setActiveTab('generate');
          }}
        />
      )}

      {/* Quick Search Global Command Palette */}
      <QuickSearchPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        clients={clients}
        articles={articles}
        packingLists={packingLists}
        inventory={inventory}
        onSelectResult={handleSelectSearchResult}
      />

      {/* Cloud Connection Error / Timeout Modal Overlay */}
      {showConnectionErrorModal && (
        <div translate="no" className="fixed inset-0 bg-app-bg/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print notranslate">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up text-app-text">
            <div className="bg-app-primary/10 border-b border-app-border p-5 flex items-start gap-3.5">
              <div className="bg-app-primary/20 text-app-primary p-2.5 rounded-lg shrink-0 border border-app-primary/20">
                <CloudLightning size={20} className="stroke-[2] animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-app-text uppercase tracking-wider">CONEXIÓN NO DISPONIBLE</h4>
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mt-0.5">SISTEMA CONTROL ALMACÉN</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {connectionErrorReason && (
                <div className="bg-app-warning/10 border border-app-warning/30 rounded-lg p-3 text-xs text-app-warning">
                  <span className="font-bold block uppercase text-[10px] tracking-wider mb-1">Motivo detectado:</span>
                  <p className="font-mono text-[11px] font-semibold">{connectionErrorReason}</p>
                </div>
              )}

              <p className="text-xs font-semibold leading-relaxed text-app-text">
                No se pudo establecer conexión con la base de datos en la nube. Puedes reintentar la conexión o elegir trabajar en modo local con los datos guardados en este navegador.
              </p>
              <div className="bg-app-bg border border-app-border rounded-lg p-3 text-[10px] text-app-text/70 leading-normal font-mono">
                <span className="block font-bold text-app-text uppercase mb-1 tracking-wider text-[9px]">Aviso de sincronización:</span>
                Al trabajar en modo local, los datos de catálogos y despachos se almacenarán únicamente en el almacenamiento del navegador (localStorage) y no se sincronizarán con los demás dispositivos.
              </div>
            </div>
            
            <div className="bg-app-bg/60 px-6 py-4 border-t border-app-border flex flex-col gap-2.5 sm:flex-row justify-end">
              <button
                onClick={handleTryConnectCloud}
                className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 text-white rounded-lg text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border border-app-primary uppercase tracking-wider"
              >
                <RefreshCw size={11} className="animate-spin-slow" />
                Reintentar
              </button>
              <button
                onClick={handleChooseLocalMode}
                className="px-4 py-2 bg-app-secondary hover:bg-app-secondary/90 text-white rounded-lg text-xs font-extrabold transition flex items-center justify-center cursor-pointer shadow-sm uppercase tracking-wider text-center"
              >
                Trabajar en modo local (los datos no se sincronizarán)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Synchronization Status Modal */}
      {syncResultModal && syncResultModal.isOpen && (
        <div translate="no" className="fixed inset-0 bg-app-bg/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print notranslate">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up text-app-text">
            <div className={`border-b border-app-border p-5 flex items-start gap-3.5 ${syncResultModal.success ? 'bg-app-secondary/10' : 'bg-red-500/10'}`}>
              <div className={`p-2.5 rounded-lg shrink-0 border ${syncResultModal.success ? 'bg-app-secondary/20 text-app-secondary border-app-secondary/20' : 'bg-red-500/20 text-red-500 border-red-500/20'}`}>
                {syncResultModal.success ? (
                  <RefreshCw size={20} className="stroke-[2]" />
                ) : (
                  <CloudLightning size={20} className="stroke-[2] animate-bounce" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-app-text uppercase tracking-wider">
                  {syncResultModal.success ? 'Sincronización Exitosa' : 'Error de Sincronización'}
                </h4>
                <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${syncResultModal.success ? 'text-app-secondary' : 'text-red-500'}`}>
                  {syncResultModal.success ? 'DATOS SUBIDOS A FIRESTORE' : 'PROCESO DETENIDO'}
                </p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <AlertBanner
                type={syncResultModal.success ? "success" : "error"}
                message={syncResultModal.message}
              />
              
              {syncResultModal.success && syncResultModal.counts && (
                <div className="bg-app-bg border border-app-border rounded-lg p-4 text-[11px] leading-relaxed font-mono space-y-1.5">
                  <span className="block font-bold text-app-text uppercase mb-2 tracking-wider text-[9px]">Registros Sincronizados:</span>
                  <div className="flex justify-between border-b border-app-border/40 pb-1">
                    <span>Proveedores:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.providers}</span>
                  </div>
                  <div className="flex justify-between border-b border-app-border/40 pb-1">
                    <span>Artículos:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.articles}</span>
                  </div>
                  <div className="flex justify-between border-b border-app-border/40 pb-1">
                    <span>Clientes:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.clients}</span>
                  </div>
                  <div className="flex justify-between border-b border-app-border/40 pb-1">
                    <span>Vendedores:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.sellers}</span>
                  </div>
                  <div className="flex justify-between border-b border-app-border/40 pb-1">
                    <span>Inventario de Rollos:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.inventory}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Packing Lists:</span>
                    <span className="font-bold text-app-secondary">{syncResultModal.counts.packinglists}</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-app-bg/60 px-6 py-4 border-t border-app-border flex justify-end">
              <button
                onClick={() => {
                  const succeeded = syncResultModal.success;
                  setSyncResultModal(null);
                  if (succeeded) {
                    setLocalMode(false);
                    setIsLocal(false);
                    setLoading(true);
                    window.location.reload();
                  }
                }}
                className={`px-5 py-2.5 rounded-lg text-xs font-extrabold transition cursor-pointer shadow-sm uppercase tracking-wider ${
                  syncResultModal.success 
                    ? 'bg-app-secondary hover:bg-app-secondary/90 text-white' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {syncResultModal.success ? 'Aceptar y Reconectar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
