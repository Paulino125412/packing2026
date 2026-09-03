import React, { useState, useMemo, useEffect } from 'react';
import { RollItem, Provider, Article } from '../types';
import { db, addDoc, updateDoc, deleteDoc, fetchAllInventoryDocs, fetchAllSoldRolls } from '../firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import InventoryExcelPasteParser from './inventory/InventoryExcelPasteParser';
import { Search, Filter, Plus, FileSpreadsheet, Info, Wrench, Trash2, ShieldAlert, ArrowDownUp, X, CheckCircle, RefreshCw, Package, Tag, QrCode, ScanLine, Printer, CheckSquare, Square } from 'lucide-react';
import { exportInventoryToExcel } from '../utils/excelExport';
import AlertBanner from './AlertBanner';
import { useToast } from '../context/ToastContext';
import { analyzeSystemError } from '../lib/diagnostics';
import PrintRollLabelsModal, { PrintableRollLabel } from './PrintRollLabelsModal';
import BarcodeScannerModal from './BarcodeScannerModal';

interface InventoryManagerProps {
  inventory: RollItem[];
  providers: Provider[];
  articles: Article[];
  onRefresh: () => Promise<void>;
  currentOperator: string;
  initialSearchTerm?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  // Backward compatibility alias support
  inventoryHasMore?: boolean;
  onLoadMoreInventory?: () => void;
}

export default function InventoryManager({
  inventory,
  providers,
  articles,
  onRefresh,
  currentOperator,
  initialSearchTerm = '',
  hasMore,
  onLoadMore,
  inventoryHasMore,
  onLoadMoreInventory
}: InventoryManagerProps) {
  const isHasMore = hasMore ?? inventoryHasMore;
  const handleLoadMore = onLoadMore ?? onLoadMoreInventory;
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  React.useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);
  const [filterProviderId, setFilterProviderId] = useState('all');
  const [filterArticleId, setFilterArticleId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Full inventory search state for searching beyond paginated slice
  const [fullInventorySearchResults, setFullInventorySearchResults] = useState<RollItem[] | null>(null);
  const [isFetchingFull, setIsFetchingFull] = useState(false);

  // Check if any filter or search criteria is active
  const isFilterActive = useMemo(() => {
    return Boolean(
      searchTerm.trim() !== '' ||
      filterProviderId !== 'all' ||
      filterArticleId !== 'all' ||
      filterStatus !== 'all' ||
      startDate !== '' ||
      endDate !== ''
    );
  }, [searchTerm, filterProviderId, filterArticleId, filterStatus, startDate, endDate]);

  // When search or filters become active and more inventory exists in the DB, query Firestore for full collection
  useEffect(() => {
    let isCancelled = false;

    if (isFilterActive) {
      if (isHasMore && fullInventorySearchResults === null && !isFetchingFull) {
        setIsFetchingFull(true);
        fetchAllInventoryDocs()
          .then(allDocs => {
            if (!isCancelled) {
              setFullInventorySearchResults(allDocs);
            }
          })
          .catch(err => {
            console.error("Error fetching full inventory search results:", err);
          })
          .finally(() => {
            if (!isCancelled) {
              setIsFetchingFull(false);
            }
          });
      }
    } else {
      // Revert to normal paginated behavior when filters and search are cleared
      if (fullInventorySearchResults !== null) {
        setFullInventorySearchResults(null);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [isFilterActive, isHasMore, fullInventorySearchResults, isFetchingFull]);

  // Active dataset for filtering and statistics
  const effectiveInventory = useMemo(() => {
    if (isFilterActive && fullInventorySearchResults) {
      return fullInventorySearchResults;
    }
    return inventory;
  }, [isFilterActive, fullInventorySearchResults, inventory]);

  const toast = useToast();
  // Form states for creating a new roll
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    title?: string;
    rootCause?: string;
    solution?: string;
    technicalDetails?: string;
  } | string | null>(null);
  const [addMode, setAddMode] = useState<'individual' | 'excel'>('individual');

  const [rollNo, setRollNo] = useState('');
  const [selectedProvId, setSelectedProvId] = useState('');
  const [selectedArtId, setSelectedArtId] = useState('');
  const [initialMeters, setInitialMeters] = useState(100);
  const [lot, setLot] = useState('');
  const [partida, setPartida] = useState('');
  const [tono, setTono] = useState('');
  const [width, setWidth] = useState('');
  const [weight, setWeight] = useState('');

  // Adjustment State
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustedMeters, setAdjustedMeters] = useState<number>(0);
  const [adjustNotes, setAdjustNotes] = useState('');

  // Roll Label Printing & Barcode Scanner States
  const [isPrintLabelsOpen, setIsPrintLabelsOpen] = useState(false);
  const [rollsToPrint, setRollsToPrint] = useState<PrintableRollLabel[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedRollIds, setSelectedRollIds] = useState<Set<string>>(new Set());

  // Dynamic config for selected provider
  const activeProviderConfig = useMemo(() => {
    if (!selectedProvId) return null;
    return providers.find(p => p.id === selectedProvId) || null;
  }, [selectedProvId, providers]);

  // Helper to convert RollItem to PrintableRollLabel
  const mapRollToPrintableLabel = (roll: RollItem): PrintableRollLabel => {
    const article = articles.find(a => a.id === roll.articleId);
    const provider = providers.find(p => p.id === roll.providerId);
    return {
      id: roll.id,
      rollNumber: roll.rollNumber,
      articleId: roll.articleId,
      articleName: article?.name || 'Tela Almacén',
      providerId: roll.providerId,
      providerName: provider?.name || 'Proveedor',
      meters: roll.currentMeters > 0 ? roll.currentMeters : roll.initialMeters,
      initialMeters: roll.initialMeters,
      lot: roll.lot,
      partida: roll.partida,
      tono: roll.tono,
      width: roll.width,
      weight: roll.weight,
      createdAt: roll.createdAt,
    };
  };

  // Print a single roll label
  const handlePrintSingleRoll = (roll: RollItem) => {
    setRollsToPrint([mapRollToPrintableLabel(roll)]);
    setIsPrintLabelsOpen(true);
  };

  // Print bulk/selected roll labels
  const handlePrintBulkRolls = (onlySelected = false) => {
    const targetRolls = onlySelected
      ? effectiveInventory.filter(r => selectedRollIds.has(r.id))
      : filteredInventory;

    if (targetRolls.length === 0) {
      toast.warning('No hay rollos seleccionados o filtrados para imprimir etiquetas.');
      return;
    }

    const labels = targetRolls.map(mapRollToPrintableLabel);
    setRollsToPrint(labels);
    setIsPrintLabelsOpen(true);
  };

  // Multi-select toggle
  const toggleSelectRoll = (rollId: string) => {
    setSelectedRollIds(prev => {
      const next = new Set(prev);
      if (next.has(rollId)) {
        next.delete(rollId);
      } else {
        next.add(rollId);
      }
      return next;
    });
  };

  // Toggle select all filtered
  const toggleSelectAllFiltered = () => {
    if (selectedRollIds.size >= filteredInventory.length && filteredInventory.length > 0) {
      setSelectedRollIds(new Set());
    } else {
      setSelectedRollIds(new Set(filteredInventory.map(r => r.id)));
    }
  };

  // Handle provider change during creation
  const handleProviderChange = (provId: string) => {
    setSelectedProvId(provId);
    // Auto filter or pre-select article
    const relevantArticles = articles.filter(a => a.providerId === provId);
    if (relevantArticles.length > 0) {
      setSelectedArtId(relevantArticles[0].id);
    } else {
      setSelectedArtId('');
    }
    // Clear dynamic fields
    setLot('');
    setPartida('');
    setTono('');
    setRollNo('');
    setWidth('');
    setWeight('');
  };

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return effectiveInventory.filter(item => {
      // 1. Text Search (Matches roll number, article name, lot, tono, partida)
      const article = articles.find(a => a.id === item.articleId);
      const articleName = article?.name || '';
      const provider = providers.find(p => p.id === item.providerId);
      const providerName = provider?.name || '';
      const textToSearch = `${item.rollNumber} ${articleName} ${providerName} ${item.lot || ''} ${item.partida || ''} ${item.tono || ''} ${item.width || ''} ${item.weight || ''}`.toLowerCase();
      const matchesSearch = textToSearch.includes(searchTerm.toLowerCase());

      // 2. Provider Filter
      const matchesProvider = filterProviderId === 'all' || item.providerId === filterProviderId;

      // 3. Article Filter
      const matchesArticle = filterArticleId === 'all' || item.articleId === filterArticleId;

      // 4. Status Filter
      let matchesStatus = true;
      if (filterStatus === 'available') matchesStatus = item.currentMeters > 0;
      else if (filterStatus === 'sold') matchesStatus = item.currentMeters === 0;

      // 5. Date filter (creation date of roll)
      let matchesDate = true;
      const iDate = item.createdAt.split('T')[0];
      if (startDate && iDate < startDate) matchesDate = false;
      if (endDate && iDate > endDate) matchesDate = false;

      return matchesSearch && matchesProvider && matchesArticle && matchesStatus && matchesDate;
    });
  }, [effectiveInventory, searchTerm, filterProviderId, filterArticleId, filterStatus, startDate, endDate, articles, providers]);

  // Exhausted/Sold Rolls memo
  const soldRolls = useMemo(() => {
    return effectiveInventory.filter(item => item.currentMeters === 0 || item.status === 'sold');
  }, [effectiveInventory]);

  // Export Inventory list to Excel (XLSX with logo and formatting)
  const handleExportExcel = async () => {
    if (filteredInventory.length === 0) {
      setError('No hay registros filtrados para exportar');
      return;
    }
    await exportInventoryToExcel(filteredInventory, articles, providers);
  };

  // Submit new roll registration
  const handleAddRollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvId) {
      const diag = {
        title: 'Proveedor Requerido',
        message: 'Por favor elija un proveedor.',
        rootCause: 'El campo de selección de proveedor se encuentra vacío.',
        solution: 'Seleccione un proveedor de la lista desplegable antes de guardar.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }
    if (!selectedArtId) {
      const diag = {
        title: 'Artículo Requerido',
        message: 'Por favor elija un artículo de tela.',
        rootCause: 'No se ha seleccionado el artículo o tela para este rollo.',
        solution: 'Seleccione un artículo asociado al proveedor.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }
    if (initialMeters < 10.00) {
      const diag = {
        title: 'Metraje Mínimo de Rollo No Alcanzado',
        message: `El metraje ingresado (${initialMeters}m) es menor a 10.00m. Los rollos textiles de almacén deben tener como mínimo 10.00 metros.`,
        rootCause: `El valor de metros iniciales (${initialMeters}m) no cumple con el estándar de rollo completo (mínimo 10.00m).`,
        solution: 'Ingrese una cantidad igual o superior a 10.00 metros para registrar el rollo.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Determine what values are required based on provider config
      const finalRollNo = (activeProviderConfig?.hasRollNo ?? true) ? rollNo.trim() : `R-AUTO-${Math.floor(1000 + Math.random() * 9000)}`;
      const finalLot = activeProviderConfig?.hasLot ? lot.trim() : '';
      const finalPartida = activeProviderConfig?.hasPartida ? partida.trim() : '';
      const finalTono = activeProviderConfig?.hasTono ? tono.trim() : '';
      const finalWidth = activeProviderConfig?.hasWidth ? width.trim() : '';
      const finalWeight = activeProviderConfig?.hasWeight ? weight.trim() : '';

      if ((activeProviderConfig?.hasRollNo ?? true) && !finalRollNo) {
        throw new Error('El proveedor requiere ingresar un número de rollo.');
      }

      // Check if roll number already exists in inventory
      const duplicate = inventory.find(i => i.rollNumber.toLowerCase() === finalRollNo.toLowerCase());
      if (duplicate && (activeProviderConfig?.hasRollNo ?? true)) {
        throw new Error(`Ya existe un rollo registrado con el número "${finalRollNo}"`);
      }

      const rollData: Omit<RollItem, 'id'> & { appVersion: string } = {
        rollNumber: finalRollNo || `ROLL-${Date.now()}`,
        articleId: selectedArtId,
        providerId: selectedProvId,
        initialMeters: Number(initialMeters),
        currentMeters: Number(initialMeters),
        lot: finalLot,
        partida: finalPartida,
        tono: finalTono,
        width: finalWidth,
        weight: finalWeight,
        status: 'available',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        appVersion: '2.6r'
      };

      // Add to firestore
      await addDoc(collection(db, 'inventory'), rollData);

      await onRefresh();
      toast.success(`Rollo ${rollData.rollNumber} (${rollData.currentMeters}m) registrado con éxito.`);
      
      // Reset form
      setRollNo('');
      setLot('');
      setPartida('');
      setTono('');
      setWidth('');
      setWeight('');
      setInitialMeters(100);
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'registrar el rollo de tela', entity: 'inventory' });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'registrar el rollo de tela', entity: 'inventory' });
    } finally {
      setLoading(false);
    }
  };

  // Submit bulk roll registration
  const handleBulkImport = async (newRolls: Omit<RollItem, 'id'>[]) => {
    setLoading(true);
    setError(null);
    try {
      // Loop through and insert all rolls
      for (const roll of newRolls) {
        await addDoc(collection(db, 'inventory'), roll);
      }

      await onRefresh();
      toast.success(`Se importaron ${newRolls.length} rollos al almacén exitosamente.`);
      
      // Reset form variables
      setRollNo('');
      setLot('');
      setPartida('');
      setTono('');
      setWidth('');
      setWeight('');
      setInitialMeters(100);
      setShowAddForm(false);
    } catch (err: any) {
      console.error("Bulk import failed:", err);
      const diag = analyzeSystemError(err, { action: 'importar rollos masivos desde Excel', entity: 'inventory' });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'importar rollos masivos', entity: 'inventory' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Submit manual stock adjustment
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingId) return;

    const roll = inventory.find(r => r.id === adjustingId);
    if (!roll) return;

    if (adjustedMeters < 0) {
      const diag = {
        title: 'Metraje Negativo no Permitido',
        message: 'Los metros actuales no pueden ser menores a 0.',
        rootCause: 'Se intentó ingresar un valor numérico negativo en el stock físico.',
        solution: 'Ingrese un saldo igual o mayor a 0 metros.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const status = adjustedMeters === 0
        ? 'sold'
        : adjustedMeters >= roll.initialMeters
          ? 'available'
          : 'partially_sold';

      await updateDoc(doc(db, 'inventory', adjustingId), {
        currentMeters: Number(adjustedMeters),
        status,
        updatedAt: new Date().toISOString()
      });

      await onRefresh();
      toast.success(`Stock del rollo ${roll.rollNumber} ajustado a ${adjustedMeters}m.`);
      setAdjustingId(null);
      setAdjustNotes('');
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'ajustar el inventario del rollo', entity: 'inventory' });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'ajustar el inventario', entity: 'inventory' });
    } finally {
      setLoading(false);
    }
  };

  // Deletion Modal States for Rolls
  const [deleteTargetRoll, setDeleteTargetRoll] = useState<RollItem | null>(null);
  const [isDeletingRoll, setIsDeletingRoll] = useState(false);
  const [deleteRollError, setDeleteRollError] = useState<string | null>(null);
  const [deleteRollSuccess, setDeleteRollSuccess] = useState<string | null>(null);

  // Bulk Deletion States
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteSuccess, setBulkDeleteSuccess] = useState<string | null>(null);
  const [bulkDeleteResults, setBulkDeleteResults] = useState<{ successCount: number; failureCount: number } | null>(null);

  const initiateDeleteRoll = (roll: RollItem) => {
    setDeleteRollError(null);
    setDeleteRollSuccess(null);
    setDeleteTargetRoll(roll);
  };

  const handleConfirmDeleteRoll = async () => {
    if (!deleteTargetRoll) return;
    setIsDeletingRoll(true);
    setDeleteRollError(null);

    try {
      await deleteDoc(doc(db, 'inventory', deleteTargetRoll.id));
      
      await onRefresh();
      setDeleteRollSuccess(`El rollo "${deleteTargetRoll.rollNumber}" se eliminó de manera permanente.`);
      setTimeout(() => {
        setDeleteTargetRoll(null);
        setDeleteRollSuccess(null);
      }, 2500);
    } catch (err) {
      console.error("Roll delete failed:", err);
      setDeleteRollError(err instanceof Error ? err.message : 'Error al procesar la eliminación del rollo.');
    } finally {
      setIsDeletingRoll(false);
    }
  };

  const [allDBSoldRolls, setAllDBSoldRolls] = useState<RollItem[] | null>(null);
  const [isLoadingSoldRolls, setIsLoadingSoldRolls] = useState(false);

  useEffect(() => {
    if (isBulkDeleteOpen && isHasMore && allDBSoldRolls === null && !isLoadingSoldRolls) {
      setIsLoadingSoldRolls(true);
      fetchAllSoldRolls()
        .then(rolls => setAllDBSoldRolls(rolls))
        .catch(err => console.error("Error fetching all sold rolls:", err))
        .finally(() => setIsLoadingSoldRolls(false));
    }
  }, [isBulkDeleteOpen, isHasMore, allDBSoldRolls, isLoadingSoldRolls]);

  const targetSoldRolls = allDBSoldRolls || soldRolls;

  const handleConfirmBulkDelete = async () => {
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    setBulkDeleteSuccess(null);
    setBulkDeleteResults(null);

    let successCount = 0;
    let failureCount = 0;

    try {
      // Fetch full list of all sold rolls in the database to ensure complete cleanup
      const rollsToDelete = isHasMore ? await fetchAllSoldRolls() : targetSoldRolls;

      for (const roll of rollsToDelete) {
        try {
          await deleteDoc(doc(db, 'inventory', roll.id));
          successCount++;
        } catch (err) {
          console.error(`Error deleting roll ${roll.rollNumber}:`, err);
          failureCount++;
        }
      }

      await onRefresh();
      if (fullInventorySearchResults) {
        setFullInventorySearchResults(null);
      }
      setAllDBSoldRolls(null);

      if (failureCount === 0) {
        setBulkDeleteSuccess(`Se eliminaron correctamente los ${successCount} rollos agotados de manera permanente en todo el inventario.`);
        setTimeout(() => {
          setIsBulkDeleteOpen(false);
          setBulkDeleteSuccess(null);
        }, 3000);
      } else {
        setBulkDeleteResults({ successCount, failureCount });
      }
    } catch (err: any) {
      console.error("Bulk delete processing failed:", err);
      setBulkDeleteError(err?.message || 'Error al procesar la eliminación masiva de rollos.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-app-surface p-4 rounded-lg border border-app-border shadow-xs">
        <div className="flex items-center gap-2">
          <Info size={15} className="text-app-text/50" />
          <p className="text-xs text-app-text/60 font-medium">
            Filtre, audite y agregue rollos de tela. Al seleccionar proveedor se configuran dinámicamente los campos requeridos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (providers.length > 0) handleProviderChange(providers[0].id);
            }}
            className="px-4 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs uppercase tracking-wider"
            id="btn-toggle-add-roll"
          >
            <Plus size={14} />
            {showAddForm ? 'Cerrar Formulario' : 'Nuevo Ingreso'}
          </button>
        </div>
      </div>

      {error && (
        <AlertBanner
          type="error"
          message={typeof error === 'string' ? error : error.message}
          title={typeof error === 'object' ? error.title : undefined}
          rootCause={typeof error === 'object' ? error.rootCause : undefined}
          solution={typeof error === 'object' ? error.solution : undefined}
          technicalDetails={typeof error === 'object' ? error.technicalDetails : undefined}
          onClose={() => setError(null)}
          id="alert-inv-error"
        />
      )}

      {/* Conditionally rendered register/add form */}
      {showAddForm && (
        <div className="ticket-perforated p-5 shadow-sm">
          <h3 className="text-xs font-bold text-app-text/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Plus size={14} className="text-app-text/45" />
            Ingreso de nuevo rollo textil al almacén
          </h3>

          {/* Modes selector tabs */}
          <div className="flex border-b border-app-border mb-5">
            <button
              type="button"
              onClick={() => {
                setAddMode('individual');
                setError(null);
              }}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
                addMode === 'individual'
                  ? 'border-app-primary text-app-primary'
                  : 'border-transparent text-app-text/50 hover:text-app-text'
              }`}
            >
              Ingreso Individual
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode('excel');
                setError(null);
              }}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
                addMode === 'excel'
                  ? 'border-app-primary text-app-primary'
                  : 'border-transparent text-app-text/50 hover:text-app-text'
              }`}
            >
              Importación Masiva
            </button>
          </div>

          {addMode === 'individual' ? (
            <form onSubmit={handleAddRollSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 1. Provider */}
            <div>
              <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">1. Seleccionar Proveedor *</label>
              <select
                required
                value={selectedProvId}
                onChange={e => handleProviderChange(e.target.value)}
                className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary focus:outline-hidden font-medium"
                id="add-roll-prov"
              >
                <option value="">-- Seleccione Proveedor --</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* 2. Article */}
            <div>
              <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">2. Artículo *</label>
              <select
                required
                value={selectedArtId}
                onChange={e => setSelectedArtId(e.target.value)}
                className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary focus:outline-hidden font-medium"
                id="add-roll-art"
              >
                <option value="">-- Seleccione Artículo --</option>
                {articles
                  .filter(a => !selectedProvId || a.providerId === selectedProvId)
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
            </div>

            {/* 3. Meters */}
            <div>
              <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">3. Cantidad en Metros *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={initialMeters}
                onChange={e => setInitialMeters(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono font-medium"
                id="add-roll-meters"
              />
            </div>

            {/* Dynamic field: Roll Number */}
            {(!activeProviderConfig || (activeProviderConfig.hasRollNo ?? true)) ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Número de Rollo / Etiqueta *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. R-512"
                  value={rollNo}
                  onChange={e => setRollNo(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono font-bold"
                  id="add-roll-no"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Número de Rollo</label>
                <input
                  type="text"
                  disabled
                  value="[ Auto-Generado por Sistema ]"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Dynamic field: Lot */}
            {activeProviderConfig?.hasLot ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Lote del Proveedor *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. LT-2500"
                  value={lot}
                  onChange={e => setLot(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono"
                  id="add-roll-lot"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Lote del Proveedor</label>
                <input
                  type="text"
                  disabled
                  value="N/A (Desactivado)"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Dynamic field: Partida */}
            {activeProviderConfig?.hasPartida ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Partida / Batch *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. PT-012"
                  value={partida}
                  onChange={e => setPartida(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono"
                  id="add-roll-partida"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Partida / Batch</label>
                <input
                  type="text"
                  disabled
                  value="N/A (Desactivado)"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Dynamic field: Tono */}
            {activeProviderConfig?.hasTono ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Tono / Color Exacto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. VERDE-PETROLEO-3"
                  value={tono}
                  onChange={e => setTono(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono"
                  id="add-roll-tono"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Tono / Color Exacto</label>
                <input
                  type="text"
                  disabled
                  value="N/A (Desactivado)"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Dynamic field: Ancho */}
            {activeProviderConfig?.hasWidth ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Ancho *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 1.60"
                  value={width}
                  onChange={e => setWidth(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono"
                  id="add-roll-width"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Ancho</label>
                <input
                  type="text"
                  disabled
                  value="N/A (Desactivado)"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Dynamic field: Peso */}
            {activeProviderConfig?.hasWeight ? (
              <div>
                <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Peso *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 25.4"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs focus:ring-1 focus:ring-app-primary focus:outline-hidden bg-app-surface text-app-text font-mono"
                  id="add-roll-weight"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-app-text/45 mb-1.5 uppercase tracking-wider">Peso</label>
                <input
                  type="text"
                  disabled
                  value="N/A (Desactivado)"
                  className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-bg text-app-text/45 font-mono"
                />
              </div>
            )}

            {/* Submit button */}
            <div className="flex items-end justify-end md:col-span-4 mt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto px-6 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs transition cursor-pointer shadow-xs disabled:opacity-50 uppercase tracking-wider"
                id="btn-submit-add-roll"
              >
                {loading ? 'Procesando...' : 'Registrar Ingreso'}
              </button>
            </div>
          </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-app-bg border border-app-border p-4 rounded-lg">
                {/* 1. Provider */}
                <div>
                  <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">1. Seleccionar Proveedor *</label>
                  <select
                    required
                    value={selectedProvId}
                    onChange={e => handleProviderChange(e.target.value)}
                    className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary focus:outline-hidden font-medium"
                    id="add-roll-excel-prov"
                  >
                    <option value="">-- Seleccione Proveedor --</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Article */}
                <div>
                  <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">2. Artículo *</label>
                  <select
                    required
                    value={selectedArtId}
                    onChange={e => setSelectedArtId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary focus:outline-hidden font-medium"
                    id="add-roll-excel-art"
                  >
                    <option value="">-- Seleccione Artículo --</option>
                    {articles
                      .filter(a => !selectedProvId || a.providerId === selectedProvId)
                      .map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {selectedProvId && selectedArtId ? (
                <InventoryExcelPasteParser
                  provider={providers.find(p => p.id === selectedProvId) || null}
                  article={articles.find(a => a.id === selectedArtId) || null}
                  existingInventory={inventory}
                  onImportComplete={handleBulkImport}
                  onCancel={() => {
                    setAddMode('individual');
                    setShowAddForm(false);
                  }}
                />
              ) : (
                <div className="p-8 text-center text-app-text/50 border border-dashed border-app-border rounded-lg bg-app-bg/50">
                  <p className="text-xs font-medium">Por favor elija un Proveedor y un Artículo para habilitar la carga masiva.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced filters controls */}
      <div className="bg-app-surface border border-app-border rounded-lg p-5 shadow-xs">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
          <h4 className="text-xs font-bold text-app-text/50 uppercase tracking-wider flex items-center gap-1.5">
            <Filter size={12} className="text-app-text/50" />
            Filtros de Búsqueda Avanzados
          </h4>
          {isFetchingFull && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 rounded text-xs font-semibold animate-pulse">
              <RefreshCw size={12} className="animate-spin text-app-primary" />
              <span>Buscando en todo el inventario...</span>
            </div>
          )}
          {!isFetchingFull && isFilterActive && fullInventorySearchResults && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 rounded text-[10px] font-bold uppercase tracking-wider">
              <CheckCircle size={11} />
              <span>Búsqueda sobre todo el inventario</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-bold text-app-text/60 uppercase tracking-wider">Búsqueda rápida (Criterios)</label>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="text-[10px] font-bold text-app-primary hover:text-app-primary/80 flex items-center gap-1 uppercase tracking-wider cursor-pointer"
                title="Escanear rollo con cámara o lector USB"
              >
                <ScanLine size={12} />
                <span>Escanear Código / QR</span>
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2 text-app-text/45" size={13} />
              <input
                type="text"
                placeholder="Nº Rollo, Artículo, Lote, Tono, Partida..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-app-border rounded text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary bg-app-surface text-app-text transition font-medium"
                id="search-inventory"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Proveedor</label>
            <select
              value={filterProviderId}
              onChange={e => setFilterProviderId(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary font-medium transition cursor-pointer"
              id="filter-inv-prov"
            >
              <option value="all">Todos</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Artículo</label>
            <select
              value={filterArticleId}
              onChange={e => setFilterArticleId(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary font-medium transition cursor-pointer"
              id="filter-inv-art"
            >
              <option value="all">Todos</option>
              {articles.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Estado de Stock</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:outline-hidden focus:ring-1 focus:ring-app-primary font-medium transition cursor-pointer"
              id="filter-inv-status"
            >
              <option value="all">Todos (Histórico)</option>
              <option value="available">Con Stock Disponible</option>
              <option value="sold">Agotados (Stock 0m)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Fecha Registro (Desde)</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary font-medium focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">Fecha Registro (Hasta)</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-app-border rounded text-xs bg-app-surface text-app-text focus:ring-1 focus:ring-app-primary font-medium focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 mt-5 pt-4 border-t border-app-border">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-app-text/60 font-medium">
              Encontrados: <span className="font-semibold text-app-text">{filteredInventory.length.toLocaleString('es-PE')}</span> rollos (Total: <span className="font-semibold text-app-text">{filteredInventory.reduce((sum, item) => sum + item.currentMeters, 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</span> disponibles).
            </p>
            {selectedRollIds.size > 0 && (
              <span className="px-2 py-0.5 bg-app-primary/10 text-app-primary border border-app-primary/30 rounded text-[10px] font-bold uppercase tracking-wider">
                {selectedRollIds.size} seleccionados
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handlePrintBulkRolls(selectedRollIds.size > 0)}
              disabled={filteredInventory.length === 0}
              className={`px-3.5 py-1.5 rounded text-[10px] font-bold flex items-center gap-1.5 transition uppercase tracking-wider cursor-pointer shadow-xs ${
                selectedRollIds.size > 0
                  ? 'bg-app-primary text-white hover:bg-app-primary/90'
                  : 'bg-app-surface hover:bg-app-bg text-app-text border border-app-border'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              id="btn-print-roll-labels"
              title="Imprimir etiquetas con Código de Barras / QR para rollos"
            >
              <Tag size={12} className={selectedRollIds.size > 0 ? 'text-white' : 'text-app-primary'} />
              <span>
                {selectedRollIds.size > 0
                  ? `Imprimir Etiquetas (${selectedRollIds.size})`
                  : `Imprimir Etiquetas (${filteredInventory.length})`}
              </span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-4 py-1.5 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-[10px] font-bold flex items-center gap-1.5 transition uppercase tracking-wider cursor-pointer"
              id="btn-export-excel"
            >
              <FileSpreadsheet size={12} className="text-app-text/50" />
              Exportar Inventario
            </button>
            <button
              onClick={() => {
                setBulkDeleteError(null);
                setBulkDeleteSuccess(null);
                setBulkDeleteResults(null);
                setIsBulkDeleteOpen(true);
              }}
              disabled={soldRolls.length === 0}
              className={`px-4 py-1.5 border rounded text-[10px] font-bold flex items-center gap-1.5 transition uppercase tracking-wider cursor-pointer ${
                soldRolls.length > 0
                  ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/40'
                  : 'bg-app-surface/50 border-app-border text-app-text/30 cursor-not-allowed opacity-50'
              }`}
              id="btn-delete-sold-rolls"
            >
              <Trash2 size={12} />
              Eliminar Agotados ({soldRolls.length})
            </button>
          </div>
        </div>
      </div>

      {/* Inventory table */}
      <div className="bg-app-surface border border-app-border rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-app-surface">
              <tr className="bg-app-surface border-b border-app-border text-[10px] text-app-text/60 uppercase font-bold tracking-wider">
                <th className="p-3 pl-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="cursor-pointer text-app-text/60 hover:text-app-primary"
                    title={selectedRollIds.size === filteredInventory.length && filteredInventory.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
                  >
                    {selectedRollIds.size > 0 && selectedRollIds.size >= filteredInventory.length ? (
                      <CheckSquare size={14} className="text-app-primary" />
                    ) : (
                      <Square size={14} />
                    )}
                  </button>
                </th>
                <th className="p-4">Número de Rollo</th>
                <th className="p-4">Artículo / Tela</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4 font-mono">Lote</th>
                <th className="p-4 font-mono">Partida</th>
                <th className="p-4 font-mono">Tono</th>
                {filteredInventory.some(item => item.width && item.width.trim() !== '') && (
                  <th className="p-4 font-mono text-center">Ancho</th>
                )}
                {filteredInventory.some(item => item.weight && item.weight.trim() !== '') && (
                  <th className="p-4 font-mono text-center">Peso</th>
                )}
                <th className="p-4 text-right">Mts. Iniciales</th>
                <th className="p-4 text-right">Mts. Disponibles</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right pr-5">Ajuste / Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/40 text-xs text-app-text">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      11 +
                      (inventory.some(item => item.width && item.width.trim() !== '') ? 1 : 0) +
                      (inventory.some(item => item.weight && item.weight.trim() !== '') ? 1 : 0)
                    }
                    className="p-12 text-center"
                  >
                    <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                        {inventory.length === 0 ? (
                          <Package size={32} />
                        ) : (
                          <Search size={32} className="text-app-text/40" />
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-app-text uppercase tracking-wider mb-1">
                        {inventory.length === 0
                          ? 'Inventario de rollos vacío'
                          : 'Sin resultados en el inventario'}
                      </h4>
                      <p className="text-xs text-app-text/60 font-medium leading-relaxed mb-4">
                        {inventory.length === 0
                          ? 'No hay rollos de tela registrados en la base de datos. Comience registrando el ingreso del primer rollo.'
                          : 'No se encontraron rollos de tela con los filtros de búsqueda seleccionados.'}
                      </p>
                      {inventory.length === 0 ? (
                        <button
                          onClick={() => {
                            setShowAddForm(true);
                            if (providers.length > 0) handleProviderChange(providers[0].id);
                          }}
                          className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-2 transition shadow-xs uppercase tracking-wider cursor-pointer"
                        >
                          <Plus size={14} />
                          Registrar primer rollo
                        </button>
                      ) : (searchTerm || filterProviderId !== 'all' || filterArticleId !== 'all' || filterStatus !== 'all' || startDate || endDate) ? (
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            setFilterProviderId('all');
                            setFilterArticleId('all');
                            setFilterStatus('all');
                            setStartDate('');
                            setEndDate('');
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
                filteredInventory.map(item => {
                  const article = articles.find(a => a.id === item.articleId);
                  const provider = providers.find(p => p.id === item.providerId);
                  const isAvailable = item.currentMeters > 0;

                  const isSelected = selectedRollIds.has(item.id);

                  return (
                    <tr key={item.id} className={`hover:bg-app-bg/40 transition duration-150 ${isSelected ? 'bg-app-primary/5' : !isAvailable ? 'bg-app-bg/20 text-app-text/45' : ''}`}>
                      <td className="p-3 pl-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectRoll(item.id)}
                          className="cursor-pointer text-app-text/60 hover:text-app-primary"
                        >
                          {isSelected ? (
                            <CheckSquare size={14} className="text-app-primary" />
                          ) : (
                            <Square size={14} />
                          )}
                        </button>
                      </td>
                      <td className="p-4 font-mono font-bold text-app-text">
                        <span className="warehouse-tag">{item.rollNumber}</span>
                      </td>
                      <td className="p-4 font-semibold text-app-text">
                        {article?.name || 'Artículo Eliminado'}
                      </td>
                      <td className="p-4 text-app-text/60 font-medium">
                        {provider?.name || 'Proveedor Eliminado'}
                      </td>
                      <td className="p-4 font-mono">{item.lot || '-'}</td>
                      <td className="p-4 font-mono">{item.partida || '-'}</td>
                      <td className="p-4 font-mono">{item.tono || '-'}</td>
                      {filteredInventory.some(r => r.width && r.width.trim() !== '') && (
                        <td className="p-4 font-mono text-center">{item.width || '-'}</td>
                      )}
                      {filteredInventory.some(r => r.weight && r.weight.trim() !== '') && (
                        <td className="p-4 font-mono text-center">{item.weight || '-'}</td>
                      )}
                      <td className="p-4 text-right font-mono font-medium text-app-text/45">{item.initialMeters.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                      <td className={`p-4 text-right font-mono font-bold ${isAvailable ? 'text-app-secondary text-sm' : 'text-app-text/45'}`}>
                        {item.currentMeters.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2 py-0.5 text-[9px] rounded font-bold border ${
                          isAvailable
                            ? 'bg-app-bg text-app-secondary border-app-secondary/35'
                            : 'bg-app-bg/50 text-app-text/40 border-app-border/40'
                        }`}>
                          {isAvailable ? 'DISPONIBLE' : 'AGOTADO'}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-5">
                        <div className="flex justify-end gap-1 items-center">
                          {adjustingId === item.id ? (
                            <form onSubmit={handleAdjustSubmit} className="flex items-center gap-1.5 max-w-xs no-print">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                value={adjustedMeters}
                                onChange={e => setAdjustedMeters(Number(e.target.value))}
                                className="w-16 px-1.5 py-1 border border-app-border rounded text-xs text-right font-mono font-bold bg-app-surface text-app-text"
                              />
                              <input
                                type="text"
                                placeholder="Nota..."
                                value={adjustNotes}
                                onChange={e => setAdjustNotes(e.target.value)}
                                className="w-16 px-1.5 py-1 border border-app-border rounded text-[10px] bg-app-surface text-app-text"
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 bg-app-primary hover:bg-app-primary/90 text-white rounded text-[10px] font-bold cursor-pointer"
                              >
                                SÍ
                              </button>
                              <button
                                type="button"
                                onClick={() => setAdjustingId(null)}
                                className="px-2 py-1 bg-app-bg text-app-text hover:bg-app-border rounded text-[10px] font-bold cursor-pointer"
                              >
                                NO
                              </button>
                            </form>
                          ) : (
                            <div className="flex justify-end items-center gap-1.5 no-print">
                              <button
                                onClick={() => handlePrintSingleRoll(item)}
                                className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/80 hover:text-app-primary border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                                title="Imprimir etiqueta con Código de Barras y QR"
                              >
                                <Tag size={12} className="text-app-primary" />
                                <span className="hidden md:inline">Etiqueta</span>
                              </button>
                              <button
                                onClick={() => {
                                  setAdjustingId(item.id);
                                  setAdjustedMeters(item.currentMeters);
                                }}
                                className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                                title="Ajustar metros del rollo"
                              >
                                <Wrench size={12} />
                                <span className="hidden md:inline">Ajustar</span>
                              </button>
                              <button
                                onClick={() => initiateDeleteRoll(item)}
                                className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-600 hover:text-white rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider shadow-2xs"
                                title="Eliminar Rollo del inventario"
                              >
                                <Trash2 size={12} />
                                <span className="hidden md:inline">Eliminar</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Button - only displayed when not searching/filtering the full collection */}
        {!isFilterActive && isHasMore && (
          <div className="p-4 border-t border-app-border bg-app-surface/50 flex justify-center items-center">
            <button
              type="button"
              onClick={handleLoadMore}
              className="px-4 py-2 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition flex items-center gap-2 uppercase tracking-wider cursor-pointer shadow-xs"
              id="btn-load-more-inventory"
            >
              <RefreshCw size={13} className="text-app-text/50" />
              Cargar más
            </button>
          </div>
        )}
      </div>

      {/* Custom Roll Deletion Confirmation Modal */}
      {deleteTargetRoll && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded w-full max-w-md shadow-xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-950/40 p-5 flex items-center gap-3">
              <div className="bg-red-500 text-white p-2 rounded">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">ELIMINAR ROLLO FÍSICO</h4>
                <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mt-0.5">AVISO DE INVENTARIO</p>
              </div>
              <button 
                onClick={() => !isDeletingRoll && setDeleteTargetRoll(null)} 
                className="ml-auto text-app-text/45 hover:text-app-text cursor-pointer"
                disabled={isDeletingRoll}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {deleteRollSuccess ? (
                <AlertBanner
                  type="success"
                  message={deleteRollSuccess}
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-xs font-medium leading-relaxed text-app-text/80">
                    ¿Está totalmente seguro de que desea eliminar permanentemente el rollo de almacén <strong className="text-app-text bg-app-bg px-1.5 py-0.5 rounded font-mono font-bold">{deleteTargetRoll.rollNumber}</strong>?
                  </p>
                  
                  <AlertBanner
                    type="warning"
                    message={
                      <span>
                        <strong>ATENCIÓN ALMACÉN:</strong> Esta acción borrará permanentemente la existencia de este rollo del inventario activo y se registrará un movimiento contable de ajuste negativo en las bitácoras.
                      </span>
                    }
                  />

                  {deleteRollError && (
                    <AlertBanner
                      type="error"
                      message={deleteRollError}
                      onClose={() => setDeleteRollError(null)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            {!deleteRollSuccess && (
              <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setDeleteTargetRoll(null)}
                  disabled={isDeletingRoll}
                  className="px-3 py-1.5 hover:bg-app-border text-app-text/75 hover:text-app-text border border-app-border rounded text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDeleteRoll}
                  disabled={isDeletingRoll}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isDeletingRoll ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={12} />
                      Confirmar Borrado
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Custom Bulk Roll Deletion Confirmation Modal */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded w-full max-w-md shadow-xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-950/40 p-5 flex items-center gap-3">
              <div className="bg-red-500 text-white p-2 rounded">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">ELIMINAR ROLLOS AGOTADOS</h4>
                <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mt-0.5">ELIMINACIÓN MASIVA</p>
              </div>
              <button 
                onClick={() => !isBulkDeleting && setIsBulkDeleteOpen(false)} 
                className="ml-auto text-app-text/45 hover:text-app-text cursor-pointer"
                disabled={isBulkDeleting}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {bulkDeleteSuccess ? (
                <AlertBanner
                  type="success"
                  message={bulkDeleteSuccess}
                />
              ) : bulkDeleteResults ? (
                <div className="space-y-4">
                  <AlertBanner
                    type="warning"
                    message={
                      <span>
                        Se completó el proceso de eliminación masiva. Eliminados: <strong>{bulkDeleteResults.successCount}</strong>, Errores: <strong>{bulkDeleteResults.failureCount}</strong>.
                      </span>
                    }
                  />
                  <button
                    onClick={() => {
                      setIsBulkDeleteOpen(false);
                      setBulkDeleteResults(null);
                    }}
                    className="w-full py-2 bg-app-surface border border-app-border hover:bg-app-bg text-app-text rounded text-xs font-bold transition cursor-pointer uppercase tracking-wider"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {isLoadingSoldRolls ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-xs text-app-text/70 bg-app-bg rounded">
                      <RefreshCw size={13} className="animate-spin text-app-primary" />
                      <span>Cargando lista de rollos agotados en todo el inventario...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-medium leading-relaxed text-app-text/80">
                        ¿Está totalmente seguro de que desea eliminar permanentemente los <strong className="text-app-text bg-app-bg px-1.5 py-0.5 rounded font-bold">{targetSoldRolls.length}</strong> rollos agotados (0 metros) del inventario?
                      </p>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-app-text/50 uppercase tracking-wider block">Lista de rollos a eliminar ({targetSoldRolls.length}):</label>
                        <div className="max-h-40 overflow-y-auto border border-app-border bg-app-bg/50 rounded p-2 text-[11px] divide-y divide-app-border/40 font-mono">
                          {targetSoldRolls.map(item => {
                            const article = articles.find(a => a.id === item.articleId);
                            return (
                              <div key={item.id} className="py-1 flex justify-between items-center">
                                <span className="font-bold text-app-primary">{item.rollNumber}</span>
                                <span className="text-app-text/60 max-w-[200px] truncate">{article?.name || 'Artículo desconocido'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  
                  <AlertBanner
                    type="warning"
                    message={
                      <span>
                        <strong>ATENCIÓN ALMACÉN:</strong> Esta acción es irreversible. Los rollos eliminados ya no podrán ser detectados como 'previamente usados' si se vuelve a escanear o escribir su número en el futuro.
                      </span>
                    }
                  />

                  {bulkDeleteError && (
                    <AlertBanner
                      type="error"
                      message={bulkDeleteError}
                      onClose={() => setBulkDeleteError(null)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            {!bulkDeleteSuccess && !bulkDeleteResults && (
              <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => setIsBulkDeleteOpen(false)}
                  disabled={isBulkDeleting}
                  className="px-3 py-1.5 hover:bg-app-border text-app-text/75 hover:text-app-text border border-app-border rounded text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmBulkDelete}
                  disabled={isBulkDeleting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer uppercase tracking-wider"
                >
                  {isBulkDeleting ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={12} />
                      Eliminar Definitivamente
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Roll Labels Printing Modal (Thermal & A4 Stickers with Barcode + QR) */}
      {isPrintLabelsOpen && (
        <PrintRollLabelsModal
          rolls={rollsToPrint}
          onClose={() => setIsPrintLabelsOpen(false)}
        />
      )}

      {/* Barcode / QR Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanResult={(scannedItem) => {
            if (scannedItem?.rollNumber) {
              setSearchTerm(scannedItem.rollNumber);
              toast.success(`Rollo detectado: ${scannedItem.rollNumber}`);
            }
            setIsScannerOpen(false);
          }}
        />
      )}

    </div>
  );
}
