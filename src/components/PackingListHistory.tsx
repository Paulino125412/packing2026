import React, { useState, useMemo, useEffect } from 'react';
import { PackingList, Client, Seller, Provider, Article, RollItem } from '../types';
import { db, deleteDoc, updateDoc, runTransaction } from '../firebase';
import { doc } from 'firebase/firestore';
import { Search, Filter, Printer, Trash2, Calendar, User, Eye, Layers, FileText, AlertTriangle, CheckCircle, RefreshCw, X, Edit2, FileSpreadsheet, MessageCircle, Mail, Plus, MoreVertical } from 'lucide-react';
import { exportPackingListSummaryToExcel, exportPackingListFullDetailsToExcel, exportSinglePackingListToExcel } from '../utils/excelExport';
import AlertBanner from './AlertBanner';

interface PackingListHistoryProps {
  packingLists: PackingList[];
  clients: Client[];
  sellers: Seller[];
  providers: Provider[];
  articles: Article[];
  inventory: RollItem[];
  onRefresh: () => Promise<void>;
  onSelectPrint: (pl: PackingList) => void;
  onEdit: (pl: PackingList) => void;
  onDuplicate?: (pl: PackingList) => void;
  initialSearchTerm?: string;
  onCreateNew?: () => void;
}

export default function PackingListHistory({
  packingLists,
  clients,
  sellers,
  providers,
  articles,
  inventory,
  onRefresh,
  onSelectPrint,
  onEdit,
  initialSearchTerm,
  onCreateNew
}: PackingListHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Handle external filtering from global search
  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterClientId, setFilterClientId] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showOnlyNoGuide, setShowOnlyNoGuide] = useState(false);

  // State for row actions dropdown menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Custom modal states for secure deletion
  const [deleteTarget, setDeleteTarget] = useState<PackingList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Cliente Eliminado';
  const getSellerName = (id: string) => sellers.find(s => s.id === id)?.name || 'Vendedor Eliminado';
  const getArticleName = (id: string) => articles.find(a => a.id === id)?.name || id;
  const getProviderName = (id: string) => providers.find(p => p.id === id)?.name || id;

  const handleShareWhatsApp = (pl: PackingList) => {
    const clientObj = clients.find(c => c.id === pl.clientId);
    const clientName = clientObj?.name || 'Cliente';
    const clientPhone = clientObj?.phone ? clientObj.phone.replace(/[^0-9]/g, '') : '';
    const totalMeters = pl.items.reduce((acc, item) => acc + item.meters, 0);
    const totalWeight = pl.items.reduce((acc, item) => {
      const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
      const parsedW = parseFloat(rawW);
      return acc + (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0 ? parsedW : 0);
    }, 0);

    const articleGroups: Record<string, { meters: number; weight: number }> = {};
    pl.items.forEach(item => {
      const artName = getArticleName(item.articleId);
      if (!articleGroups[artName]) {
        articleGroups[artName] = { meters: 0, weight: 0 };
      }
      articleGroups[artName].meters += item.meters;
      const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
      const parsedW = parseFloat(rawW);
      if (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0) {
        articleGroups[artName].weight += parsedW;
      }
    });

    const articleSummary = Object.entries(articleGroups)
      .map(([art, data]) => `  • *${art}:* ${data.meters.toFixed(2)} m${data.weight > 0 ? ` | ${data.weight.toFixed(2)} kg` : ''}`)
      .join('\n');

    const message = `📋 *PACKING LIST - DESPACHO N° ${pl.packingListNo}*
----------------------------------------
👤 *Cliente:* ${clientName}
🚚 *Guía N°:* ${pl.guideNumber || 'Sin Guía'}
📅 *Fecha:* ${pl.date}
📍 *Destino:* ${pl.dispatchAddress || 'Almacén Central'}

📦 *RESUMEN DE TELAS:*
${articleSummary}

📊 *TOTALES:*
• *Rollos/Cortes:* ${pl.totalRollsOrCuts}
• *Metros Totales:* ${totalMeters.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m${totalWeight > 0 ? `\n• *Peso Total:* ${totalWeight.toFixed(2)} kg` : ''}

_Generado automáticamente desde Sistema TexFlow Almacén_`;

    const baseUrl = clientPhone ? `https://wa.me/${clientPhone}` : `https://wa.me/`;
    window.open(`${baseUrl}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleShareEmail = (pl: PackingList) => {
    const clientObj = clients.find(c => c.id === pl.clientId);
    const clientName = clientObj?.name || 'Cliente';
    const clientEmail = clientObj?.email || '';
    const totalMeters = pl.items.reduce((acc, item) => acc + item.meters, 0);
    const totalWeight = pl.items.reduce((acc, item) => {
      const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
      const parsedW = parseFloat(rawW);
      return acc + (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0 ? parsedW : 0);
    }, 0);

    const articleGroups: Record<string, { meters: number; weight: number }> = {};
    pl.items.forEach(item => {
      const artName = getArticleName(item.articleId);
      if (!articleGroups[artName]) {
        articleGroups[artName] = { meters: 0, weight: 0 };
      }
      articleGroups[artName].meters += item.meters;
      const rawW = (item.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
      const parsedW = parseFloat(rawW);
      if (!isNaN(parsedW) && isFinite(parsedW) && parsedW > 0) {
        articleGroups[artName].weight += parsedW;
      }
    });

    const articleSummary = Object.entries(articleGroups)
      .map(([art, data]) => `- ${art}: ${data.meters.toFixed(2)} m${data.weight > 0 ? ` | ${data.weight.toFixed(2)} kg` : ''}`)
      .join('\n');

    const subject = `Packing List N° ${pl.packingListNo} - ${clientName}`;
    const body = `Estimado(a) ${clientName},\n\nAdjuntamos la información correspondiente al Packing List N° ${pl.packingListNo}:\n\n- Fecha: ${pl.date}\n- Guía de Remisión N°: ${pl.guideNumber || 'S/N'}\n- Dirección de Despacho: ${pl.dispatchAddress || 'Almacén'}\n- Total Rollos/Cortes: ${pl.totalRollsOrCuts}\n- Total Metros: ${totalMeters.toFixed(2)} m${totalWeight > 0 ? `\n- Total Peso: ${totalWeight.toFixed(2)} kg` : ''}\n\nDetalle de telas despachadas:\n${articleSummary}\n\nSi tiene alguna duda o consulta sobre su pedido, estamos a su disposición.\n\nAtentamente,\nEquipo de Despacho y Almacén`;

    const mailtoUrl = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  // 1. Export summary of filtered Packing Lists to Excel
  const handleExportSummary = async () => {
    if (filteredLists.length === 0) {
      setDeleteError('No hay despachos filtrados para exportar');
      return;
    }
    await exportPackingListSummaryToExcel(filteredLists, clients, sellers);
  };

  // 2. Export deep/flattened details of all filtered roll items to Excel
  const handleExportFullDetails = async () => {
    if (filteredLists.length === 0) {
      setDeleteError('No hay despachos filtrados para exportar');
      return;
    }
    await exportPackingListFullDetailsToExcel(filteredLists, articles, clients, sellers);
  };

  // 3. Export a single Packing List in beautiful, print-ready custom format
  const handleExportSinglePL = async (pl: PackingList) => {
    const clientObj = clients.find(c => c.id === pl.clientId);
    const sellerObj = sellers.find(s => s.id === pl.sellerId);
    await exportSinglePackingListToExcel(pl, clientObj, sellerObj, articles);
  };

  // Sort packing lists by sequential PL number descending (newest number first)
  const sortedPackingLists = useMemo(() => {
    return [...packingLists].sort((a, b) => {
      const getNum = (no: string) => {
        const match = no?.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };
      const numA = getNum(a.packingListNo);
      const numB = getNum(b.packingListNo);
      if (numA !== numB) {
        return numB - numA; // Sort by PL number descending
      }
      // If PL numbers are same or don't have numbers, fallback to date descending
      return new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime();
    });
  }, [packingLists]);

  // Filter packing lists
  const filteredLists = useMemo(() => {
    return sortedPackingLists.filter(pl => {
      // 1. General search term (Matches PL No, Client name, Seller name)
      const clientName = getClientName(pl.clientId);
      const sellerName = getSellerName(pl.sellerId);
      const searchText = `${pl.packingListNo || ''} ${clientName || ''} ${sellerName || ''}`.toLowerCase();
      const matchesSearch = searchText.includes((searchTerm || '').toLowerCase());

      // 2. Type Filter (Roll or Cut)
      const matchesType = filterType === 'all' || pl.type === filterType;

      // 3. Client Filter
      const matchesClient = filterClientId === 'all' || pl.clientId === filterClientId;

      // 4. Date Range
      let matchesDate = true;
      if (startDate && pl.date < startDate) matchesDate = false;
      if (endDate && pl.date > endDate) matchesDate = false;

      // 5. No Guide Filter
      let matchesNoGuide = true;
      if (showOnlyNoGuide) {
        matchesNoGuide = !pl.guideNumber || pl.guideNumber.trim() === '';
      }

      return matchesSearch && matchesType && matchesClient && matchesDate && matchesNoGuide;
    });
  }, [sortedPackingLists, searchTerm, filterType, filterClientId, startDate, endDate, showOnlyNoGuide, clients, sellers]);

  const initiateDelete = (pl: PackingList) => {
    setDeleteError(null);
    setDeleteSuccess(null);
    setDeleteTarget(pl);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await runTransaction(db, async (transaction) => {
        // Collect all unique rollIds to revert
        const rollIds = Array.from(new Set(deleteTarget.items.map(i => i.rollId).filter(Boolean))) as string[];

        // READ PHASE (Firestore rule: all reads before writes)
        const rollSnaps: Record<string, any> = {};
        for (const rollId of rollIds) {
          const rollRef = doc(db, 'inventory', rollId);
          const snap = await transaction.get(rollRef);
          if (snap.exists()) {
            rollSnaps[rollId] = snap.data();
          } else {
            const localRoll = inventory.find(r => r.id === rollId);
            if (localRoll) rollSnaps[rollId] = localRoll;
          }
        }

        // WRITE PHASE: Delete the packing list doc
        const plRef = doc(db, 'packinglists', deleteTarget.id);
        transaction.delete(plRef);

        // Revert inventory roll stock
        for (const rollId of rollIds) {
          const baseData = rollSnaps[rollId];
          if (!baseData) continue;

          const revertedMeters = deleteTarget.items
            .filter(i => i.rollId === rollId)
            .reduce((sum, item) => sum + item.meters, 0);

          const initialMeters = Number(baseData.initialMeters || baseData.currentMeters || 0);
          const currentMeters = Number(baseData.currentMeters || 0);
          const nextMeters = currentMeters + revertedMeters;
          const status = nextMeters >= initialMeters ? 'available' : 'partially_sold';

          const rollRef = doc(db, 'inventory', rollId);
          transaction.update(rollRef, {
            currentMeters: nextMeters,
            status,
            updatedAt: new Date().toISOString()
          });
        }
      });

      // Let the main layout trigger database sync
      await onRefresh();
      
      setDeleteSuccess(`El packing list "${deleteTarget.packingListNo}" se eliminó de manera permanente y atómica.`);
      setTimeout(() => {
        setDeleteTarget(null);
        setDeleteSuccess(null);
      }, 2500);
    } catch (err) {
      console.error("Delete operation failed:", err);
      setDeleteError(err instanceof Error ? err.message : 'Error desconocido al procesar la eliminación de base de datos.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {deleteSuccess && !deleteTarget && (
        <AlertBanner
          type="success"
          message={deleteSuccess}
          onClose={() => setDeleteSuccess(null)}
          id="alert-pl-history-success"
        />
      )}

      {deleteError && !deleteTarget && (
        <AlertBanner
          type="error"
          message={deleteError}
          onClose={() => setDeleteError(null)}
          id="alert-pl-history-error"
        />
      )}

      {/* Search and Filters - Serious High End UI */}
      <div className="bg-app-surface border border-app-border rounded-lg p-5 shadow-xs">
        <h3 className="text-xs font-bold text-app-text/50 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Filter size={12} className="text-app-text/50" />
          Filtros de Búsqueda de Despachos
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          {/* Quick search */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Buscar por Documento o Cliente</label>
            <div className="relative">
              <Search className="absolute left-3 top-2 text-app-text/45" size={13} />
              <input
                type="text"
                placeholder="Nº Packing list, cliente, vendedor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-app-border rounded text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary bg-app-surface text-app-text transition"
                id="search-packinglist"
              />
            </div>
          </div>

          {/* Type filter */}
          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Tipo de Formato</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary focus:outline-hidden transition cursor-pointer font-medium"
              id="filter-pl-type"
            >
              <option value="all">Todos los formatos</option>
              <option value="nuevo">P. List Nuevo (Rollos)</option>
              <option value="antiguo">P. List Antiguo (Cortes)</option>
              <option value="corte">P. List Corte (Cortes)</option>
              <option value="rollo">Legacy (Rollos)</option>
            </select>
          </div>

          {/* Date range filter */}
          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Desde Fecha</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary transition font-medium focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Hasta Fecha</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary transition font-medium focus:outline-hidden"
            />
          </div>
        </div>

        {/* Filtro adicional para guía */}
        <div className="mt-4 flex items-center">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-app-text/80 select-none">
            <input
              type="checkbox"
              checked={showOnlyNoGuide}
              onChange={e => setShowOnlyNoGuide(e.target.checked)}
              className="rounded border-app-border text-app-primary focus:ring-app-primary focus:ring-offset-0 bg-app-surface w-4 h-4 cursor-pointer"
              id="filter-pl-no-guide"
            />
            <span>Mostrar solo Packing Lists sin número de guía</span>
          </label>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 mt-5 pt-4 border-t border-app-border">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-app-text/60 font-medium">
              Mostrando <span className="font-semibold text-app-text">{filteredLists.length}</span> documentos de packing list registrados.
            </p>
            {filteredLists.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportSummary}
                  className="px-3 py-1 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-[10px] font-bold flex items-center gap-1.5 transition uppercase tracking-wider cursor-pointer"
                  title="Exportar resumen de documentos filtrados a Excel"
                >
                  <FileSpreadsheet size={12} className="text-app-text/50" />
                  Exportar Resumen
                </button>
                <button
                  onClick={handleExportFullDetails}
                  className="px-3 py-1 bg-app-primary hover:bg-app-primary/90 text-white rounded text-[10px] font-bold flex items-center gap-1.5 transition uppercase tracking-wider cursor-pointer shadow-xs"
                  title="Exportar todos los rollos/cortes de documentos filtrados en formato plano a Excel"
                >
                  <FileSpreadsheet size={12} />
                  Exportar Detalle Completo
                </button>
              </div>
            )}
          </div>
          {(searchTerm || filterType !== 'all' || startDate || endDate || showOnlyNoGuide) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
                setStartDate('');
                setEndDate('');
                setShowOnlyNoGuide(false);
              }}
              className="text-[10px] uppercase tracking-wider text-app-text/60 hover:text-app-text font-bold transition cursor-pointer"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards / Statistics Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Despachos */}
        <div className="ticket-perforated p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-app-text/50 uppercase tracking-wider">Total de Despachos</span>
            <span className="bg-app-bg text-app-text text-[10px] px-2 py-0.5 rounded font-bold">Docs</span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-app-text tracking-tight">{filteredLists.length.toLocaleString('es-PE')}</span>
            <span className="text-[10px] text-app-text/50 block mt-1 font-medium">Documentos registrados en este filtro</span>
          </div>
        </div>

        {/* Card 2: Total Metraje */}
        <div className="ticket-perforated p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-app-text/50 uppercase tracking-wider">Metraje Despachado</span>
            <span className="bg-app-bg text-app-secondary text-[10px] px-2 py-0.5 rounded font-bold">Mts</span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-app-text tracking-tight">
              {filteredLists.reduce((acc, pl) => acc + pl.items.reduce((sum, item) => sum + item.meters, 0), 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-app-text/50 block mt-1 font-medium">Metros totales despachados</span>
          </div>
        </div>

        {/* Card 3: Total Rollos / Cortes */}
        <div className="ticket-perforated p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-app-text/50 uppercase tracking-wider">Total Rollos / Cortes</span>
            <span className="bg-app-bg text-app-text text-[10px] px-2 py-0.5 rounded font-bold">Ítems</span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-app-text tracking-tight">
              {filteredLists.reduce((acc, pl) => acc + pl.items.length, 0).toLocaleString('es-PE')}
            </span>
            <span className="text-[10px] text-app-text/50 block mt-1 font-medium">Cantidad de piezas despachadas</span>
          </div>
        </div>
      </div>

      {/* History Table - Corporate Grid Layout */}
      <div className="bg-app-surface border border-app-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-app-surface">
              <tr className="bg-app-surface border-b border-app-border text-[10px] text-app-text/60 uppercase font-bold tracking-wider">
                <th className="p-4 pl-5 text-center w-12">Nº</th>
                <th className="p-4">Nº Packing List</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Fecha Despacho</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Vendedor</th>
                <th className="p-4 text-center">Cant. Ítems</th>
                <th className="p-4 text-right">Mts Despachados</th>
                <th className="p-4 text-right pr-5">Operaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/40 text-xs text-app-text">
              {filteredLists.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                        {packingLists.length === 0 ? (
                          <FileText size={32} />
                        ) : (
                          <Search size={32} className="text-app-text/40" />
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-app-text uppercase tracking-wider mb-1">
                        {packingLists.length === 0
                          ? 'No hay Packing Lists registrados'
                          : 'Sin resultados para la búsqueda'}
                      </h4>
                      <p className="text-xs text-app-text/60 font-medium leading-relaxed mb-4">
                        {packingLists.length === 0
                          ? 'Aún no se ha generado ningún despacho. Comience creando el primer Packing List para registrar los envíos.'
                          : 'No se encontraron documentos de packing list con los filtros de búsqueda aplicados.'}
                      </p>
                      {packingLists.length === 0 && onCreateNew ? (
                        <button
                          onClick={onCreateNew}
                          className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-2 transition shadow-xs uppercase tracking-wider cursor-pointer"
                        >
                          <Plus size={14} />
                          Crear primer Packing List
                        </button>
                      ) : (searchTerm || filterType !== 'all' || startDate || endDate || showOnlyNoGuide) ? (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setFilterType('all');
                            setStartDate('');
                            setEndDate('');
                            setShowOnlyNoGuide(false);
                          }}
                          className="px-3 py-1.5 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                        >
                          Limpiar Filtros
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLists.map((pl, index) => {
                  const totalMeters = pl.items.reduce((acc, item) => acc + item.meters, 0);

                  return (
                    <tr key={pl.id} className="hover:bg-app-bg/40 transition duration-150">
                      <td className="p-4 pl-5 text-center font-mono font-bold text-app-text/50 bg-app-bg/10">{index + 1}</td>
                      <td className="p-4 font-mono font-bold text-app-text">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="warehouse-tag">{pl.packingListNo}</span>
                          {(!pl.guideNumber || pl.guideNumber.trim() === '') ? (
                            <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider bg-[#B5822A]/10 text-[#B5822A] border border-[#B5822A]/25">
                              SIN GUÍA
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-app-text/50 font-sans tracking-normal" title={`Nº Guía: ${pl.guideNumber}`}>
                              Guía: {pl.guideNumber}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider ${
                          pl.type === 'nuevo' || pl.type === 'rollo'
                            ? 'bg-app-bg text-app-text border border-app-border'
                            : pl.type === 'antiguo'
                            ? 'bg-app-bg/50 text-app-text/70 border border-app-border/60'
                            : 'bg-app-bg text-app-secondary border border-app-secondary/35'
                        }`}>
                          {pl.type === 'nuevo' ? 'Nuevo' : pl.type === 'antiguo' ? 'Antiguo' : pl.type === 'corte' ? 'Corte' : 'Legacy'}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-[11px]">
                        <div className="font-semibold text-app-text">{pl.date}</div>
                        {pl.createdAt && (
                          <div className="text-[10px] text-app-text/50 font-semibold mt-0.5 flex items-center gap-1">
                            <span className="text-app-text/45 font-normal">Hora:</span>
                            {(() => {
                              try {
                                const d = new Date(pl.createdAt);
                                if (!isNaN(d.getTime())) {
                                  let hours = d.getHours();
                                  const minutes = String(d.getMinutes()).padStart(2, '0');
                                  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
                                  hours = hours % 12;
                                  hours = hours ? hours : 12;
                                  return `${hours}:${minutes} ${ampm}`;
                                }
                              } catch (e) {}
                              return '--:--';
                            })()}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-app-text">{getClientName(pl.clientId)}</td>
                      <td className="p-4 text-app-text/60 font-medium">{getSellerName(pl.sellerId)}</td>
                      <td className="p-4 text-center font-mono font-bold text-app-text bg-app-bg/10">{pl.items.length.toLocaleString('es-PE')}</td>
                      <td className="p-4 text-right font-mono font-bold text-app-text">{totalMeters.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                      <td className="p-4 text-right pr-5 relative">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => onSelectPrint(pl)}
                            className="px-2.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-[10px] flex items-center gap-1.5 transition uppercase tracking-wider shadow-xs cursor-pointer"
                            id={`btn-view-pl-${pl.packingListNo}`}
                            title="Imprimir o exportar PDF"
                          >
                            <Eye size={13} />
                            <span className="hidden sm:inline">Imprimir / PDF</span>
                            <span className="sm:hidden">PDF</span>
                          </button>

                          <button
                            onClick={() => onEdit(pl)}
                            className="px-2.5 py-1.5 bg-app-surface hover:bg-app-bg text-app-text hover:text-app-primary border border-app-border rounded font-bold text-[10px] flex items-center gap-1.5 transition uppercase tracking-wider shadow-2xs cursor-pointer"
                            id={`btn-edit-pl-${pl.packingListNo}`}
                            title="Editar este Packing List"
                          >
                            <Edit2 size={13} className="text-app-text/70" />
                            <span className="hidden sm:inline">Editar</span>
                          </button>

                          <div className="relative inline-block text-left">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === pl.id ? null : pl.id);
                              }}
                              className="p-1.5 bg-app-surface hover:bg-app-bg text-app-text/75 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center justify-center shadow-2xs"
                              title="Más opciones"
                              id={`btn-menu-pl-${pl.packingListNo}`}
                            >
                              <MoreVertical size={14} />
                            </button>

                            {openMenuId === pl.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-20"
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div
                                  className={`absolute right-0 ${
                                    index >= filteredLists.length - 2 && filteredLists.length > 2
                                      ? 'bottom-full mb-1'
                                      : 'top-full mt-1'
                                  } w-52 bg-app-surface border border-app-border rounded-md shadow-xl z-30 py-1 text-xs text-app-text divide-y divide-app-border/40 animate-fade-in`}
                                >
                                  <div className="py-1">
                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        onEdit(pl);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-app-bg flex items-center gap-2.5 text-app-text/80 hover:text-app-primary transition cursor-pointer font-semibold"
                                    >
                                      <Edit2 size={14} className="text-app-text/60" />
                                      <span>Editar</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        handleExportSinglePL(pl);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-app-bg flex items-center gap-2.5 text-app-text/80 hover:text-app-secondary transition cursor-pointer font-semibold"
                                    >
                                      <FileSpreadsheet size={14} className="text-app-text/60" />
                                      <span>Exportar a Excel</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        handleShareWhatsApp(pl);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-[#25D366]/10 flex items-center gap-2.5 text-app-text/80 hover:text-[#25D366] transition cursor-pointer font-semibold"
                                    >
                                      <MessageCircle size={14} className="text-[#25D366]" />
                                      <span>Compartir por WhatsApp</span>
                                    </button>
                                  </div>

                                  <div className="py-1">
                                    <button
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        initiateDelete(pl);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 text-red-600 dark:text-red-400 transition cursor-pointer font-semibold"
                                    >
                                      <Trash2 size={14} />
                                      <span>Eliminar</span>
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Enterprise Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded w-full max-w-md shadow-xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-950/40 p-5 flex items-center gap-3">
              <div className="bg-red-500 text-white p-2 rounded">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">ADVERTENCIA CRÍTICA</h4>
                <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mt-0.5">ELIMINACIÓN PERMANENTE</p>
              </div>
              <button 
                onClick={() => !isDeleting && setDeleteTarget(null)} 
                className="ml-auto text-app-text/45 hover:text-app-text cursor-pointer"
                disabled={isDeleting}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {deleteSuccess ? (
                <AlertBanner
                  type="success"
                  message={deleteSuccess}
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-medium leading-relaxed text-app-text/80">
                    ¿Está totalmente seguro de que desea eliminar permanentemente el packing list <strong className="text-app-text bg-app-bg px-1.5 py-0.5 rounded font-mono font-bold">{deleteTarget.packingListNo}</strong>?
                  </p>
                  
                  <AlertBanner
                    type="warning"
                    message={
                      <span>
                        <strong>AVISO DE EXCLUSIÓN:</strong> Esta acción borrará permanentemente el despacho de la base de datos y no se podrá recuperar. Asegúrese de que no afecte los reportes contables ni el inventario de rollos vinculados.
                      </span>
                    }
                  />

                  {deleteError && (
                    <AlertBanner
                      type="error"
                      message={deleteError}
                      onClose={() => setDeleteError(null)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            {!deleteSuccess && (
              <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 hover:bg-app-border text-app-text/75 hover:text-app-text border border-app-border rounded text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={12} />
                      Eliminar de Todo Lado
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
