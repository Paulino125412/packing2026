import React, { useState, useEffect, useMemo } from 'react';
import { SalesOrder, SalesOrderItem, Client, Seller, Article } from '../types';
import { db, addDoc, updateDoc, deleteDoc, getLocalStorageCollection, getLocalMode } from '../firebase';
import { collection, onSnapshot, doc, query, orderBy, limit } from 'firebase/firestore';
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  Printer, 
  Search, 
  Calendar, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  MessageCircle, 
  Edit2, 
  Eye, 
  RefreshCw, 
  Building, 
  Phone, 
  MapPin, 
  CreditCard, 
  Clock, 
  DollarSign,
  Loader2,
  Truck,
  X,
  Save,
  RotateCcw
} from 'lucide-react';
import PrintSalesOrder from './PrintSalesOrder';
import { lookupRucOrDni } from '../lib/sunat';
import { useToast } from '../context/ToastContext';
import { analyzeSystemError } from '../lib/diagnostics';

interface SalesOrderManagerProps {
  clients: Client[];
  sellers: Seller[];
  articles: Article[];
  currentOperator: string;
}

export default function SalesOrderManager({
  clients,
  sellers,
  articles,
  currentOperator
}: SalesOrderManagerProps) {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'create' | 'history'>('create');
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [ordersLimit, setOrdersLimit] = useState(200);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Print Modal State
  const [printOrder, setPrintOrder] = useState<SalesOrder | null>(null);

  // Delete Target Modal
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);

  // Editing state ID
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOrderNo, setEditingOrderNo] = useState<string>('');

  // Draft auto-save state
  const [hasCheckedDraft, setHasCheckedDraft] = useState(false);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [lastSavedDraftTime, setLastSavedDraftTime] = useState<string | null>(null);
  const [isSuccessfullySaved, setIsSuccessfullySaved] = useState(false);

  // Form State
  const [sellerName, setSellerName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Client & Dispatch Details
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientRucDni, setClientRucDni] = useState('');
  const [fiscalAddress, setFiscalAddress] = useState('');
  const [dispatchContactName, setDispatchContactName] = useState('');
  const [dispatchContactPhone, setDispatchContactPhone] = useState('');
  const [dispatchAddress, setDispatchAddress] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [dispatchDate, setDispatchDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [dispatchTime, setDispatchTime] = useState('Por la mañana');
  const [paymentMethod, setPaymentMethod] = useState('Contado');

  // SUNAT Lookup state
  const [loadingSunat, setLoadingSunat] = useState(false);

  const handleConsultSunat = async (rucToSearch?: string) => {
    const targetRuc = rucToSearch || clientRucDni;
    if (!targetRuc || targetRuc.trim().length < 8) {
      const errDiag = {
        title: 'Documento Incompleto',
        message: 'Ingrese un número de RUC (11 dígitos) o DNI (8 dígitos).',
        rootCause: 'El campo de documento está vacío o tiene menos de 8 caracteres numéricos.',
        solution: 'Verifique el RUC (11 dígitos) o DNI (8 dígitos) e inténtelo nuevamente.'
      };
      toast.warning(errDiag.message, {
        title: errDiag.title,
        rootCause: errDiag.rootCause,
        solution: errDiag.solution
      });
      return;
    }
    setLoadingSunat(true);
    const res = await lookupRucOrDni(targetRuc);
    setLoadingSunat(false);
    if (res.success && res.name) {
      setClientName(res.name);
      if (res.address) {
        setFiscalAddress(res.address);
        // Dispatch Address stays separate! Do NOT overwrite dispatchAddress automatically
      }
      if (!billingName) setBillingName(res.name);
      if (!billingRucDni) setBillingRucDni(targetRuc);
      toast.success(`Datos obtenidos de SUNAT para ${res.name}`);
    } else {
      const diag = analyzeSystemError(res.error || 'No se pudo consultar en SUNAT', {
        action: 'consultar RUC/DNI en SUNAT',
        additionalInfo: targetRuc
      });
      toast.warning(diag.message, {
        title: diag.title,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails,
        action: {
          label: 'Reintentar',
          onClick: () => handleConsultSunat(targetRuc)
        }
      });
    }
  };

  // Billing Details
  const [billedAmount, setBilledAmount] = useState<number | ''>('');
  const [billingName, setBillingName] = useState('');
  const [billingRucDni, setBillingRucDni] = useState('');
  const [pendingAmount, setPendingAmount] = useState<number | ''>('');

  // Observations
  const [observations, setObservations] = useState('');

  // Form Items
  const [items, setItems] = useState<SalesOrderItem[]>([
    {
      id: `item-${Date.now()}-1`,
      code: '',
      description: '',
      unitPrice: 0,
      requestedQty: 0,
      dispatchedQty: 0,
      totalAmount: 0
    }
  ]);

  // Load Sales Orders from Firestore or Local Storage
  useEffect(() => {
    if (getLocalMode()) {
      const localData = getLocalStorageCollection('sales_orders');
      setOrders(localData || []);
    } else {
      const unsubscribe = onSnapshot(
        query(collection(db, 'sales_orders'), orderBy('createdAt', 'desc'), limit(ordersLimit)),
        (snapshot) => {
          const list = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as SalesOrder[];
          setOrders(list);
          setOrdersHasMore(list.length === ordersLimit);
        },
        (err) => {
          console.warn('Fallback to local storage for sales_orders:', err);
          const localData = getLocalStorageCollection('sales_orders');
          setOrders(localData || []);
        }
      );
      return () => unsubscribe();
    }
  }, [ordersLimit]);

  // Calculate Total Amount
  const computedTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  }, [items]);

  // Check if form has meaningful content for auto-save
  const hasContent = useMemo(() => {
    return !!(
      clientName.trim() ||
      clientRucDni.trim() ||
      selectedClientId ||
      fiscalAddress.trim() ||
      dispatchAddress.trim() ||
      dispatchContactName.trim() ||
      dispatchContactPhone.trim() ||
      observations.trim() ||
      billingName.trim() ||
      billingRucDni.trim() ||
      (billedAmount !== '' && Number(billedAmount) > 0) ||
      (pendingAmount !== '' && Number(pendingAmount) > 0) ||
      items.length > 1 ||
      (items[0] && (
        items[0].code.trim() ||
        items[0].description.trim() ||
        Number(items[0].unitPrice) > 0 ||
        Number(items[0].requestedQty) > 0 ||
        Number(items[0].dispatchedQty) > 0
      ))
    );
  }, [
    clientName, clientRucDni, selectedClientId, fiscalAddress,
    dispatchAddress, dispatchContactName, dispatchContactPhone,
    observations, billingName, billingRucDni, billedAmount, pendingAmount, items
  ]);

  // Check for saved draft on mount (only when creating a new order)
  useEffect(() => {
    if (!editingId) {
      try {
        const saved = localStorage.getItem("texflow_draft_salesorder");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (
            parsed.clientName ||
            parsed.clientRucDni ||
            parsed.selectedClientId ||
            parsed.observations ||
            (parsed.items && parsed.items.length > 0 && parsed.items.some((i: any) => i.code || i.description || (Number(i.requestedQty) || 0) > 0 || (Number(i.unitPrice) || 0) > 0))
          )) {
            setDraftData(parsed);
            setShowRecoveryPrompt(true);
            return;
          }
        }
      } catch (e) {
        console.error("Error reading sales order draft from localStorage", e);
      }
    }
    setHasCheckedDraft(true);
  }, [editingId]);

  const handleRecoverDraft = () => {
    if (draftData) {
      if (draftData.sellerName !== undefined) setSellerName(draftData.sellerName);
      if (draftData.sellerId !== undefined) setSellerId(draftData.sellerId);
      if (draftData.date) setDate(draftData.date);
      if (draftData.selectedClientId !== undefined) setSelectedClientId(draftData.selectedClientId);
      if (draftData.clientName !== undefined) setClientName(draftData.clientName);
      if (draftData.clientRucDni !== undefined) setClientRucDni(draftData.clientRucDni);
      if (draftData.fiscalAddress !== undefined) setFiscalAddress(draftData.fiscalAddress);
      if (draftData.dispatchContactName !== undefined) setDispatchContactName(draftData.dispatchContactName);
      if (draftData.dispatchContactPhone !== undefined) setDispatchContactPhone(draftData.dispatchContactPhone);
      if (draftData.dispatchAddress !== undefined) setDispatchAddress(draftData.dispatchAddress);
      if (draftData.floorNumber !== undefined) setFloorNumber(draftData.floorNumber);
      if (draftData.dispatchDate) setDispatchDate(draftData.dispatchDate);
      if (draftData.dispatchTime) setDispatchTime(draftData.dispatchTime);
      if (draftData.paymentMethod) setPaymentMethod(draftData.paymentMethod);
      if (draftData.billedAmount !== undefined) setBilledAmount(draftData.billedAmount);
      if (draftData.billingName !== undefined) setBillingName(draftData.billingName);
      if (draftData.billingRucDni !== undefined) setBillingRucDni(draftData.billingRucDni);
      if (draftData.pendingAmount !== undefined) setPendingAmount(draftData.pendingAmount);
      if (draftData.observations !== undefined) setObservations(draftData.observations);
      if (draftData.items && draftData.items.length > 0) setItems(draftData.items);
      if (draftData.savedAt) {
        setLastSavedDraftTime(new Date(draftData.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }
    setShowRecoveryPrompt(false);
    setHasCheckedDraft(true);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem("texflow_draft_salesorder");
    setDraftData(null);
    setShowRecoveryPrompt(false);
    setHasCheckedDraft(true);
    setLastSavedDraftTime(null);
  };

  // Auto-save draft to localStorage whenever form values change
  useEffect(() => {
    if (hasCheckedDraft && !editingId) {
      if (hasContent) {
        const now = new Date();
        const draftObj = {
          savedAt: now.toISOString(),
          sellerName,
          sellerId,
          date,
          selectedClientId,
          clientName,
          clientRucDni,
          fiscalAddress,
          dispatchContactName,
          dispatchContactPhone,
          dispatchAddress,
          floorNumber,
          dispatchDate,
          dispatchTime,
          paymentMethod,
          billedAmount,
          billingName,
          billingRucDni,
          pendingAmount,
          observations,
          items
        };
        localStorage.setItem("texflow_draft_salesorder", JSON.stringify(draftObj));
        setLastSavedDraftTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else {
        localStorage.removeItem("texflow_draft_salesorder");
        setLastSavedDraftTime(null);
      }
    }
  }, [
    hasCheckedDraft, hasContent, editingId, sellerName, sellerId, date,
    selectedClientId, clientName, clientRucDni, fiscalAddress,
    dispatchContactName, dispatchContactPhone, dispatchAddress, floorNumber,
    dispatchDate, dispatchTime, paymentMethod, billedAmount, billingName,
    billingRucDni, pendingAmount, observations, items
  ]);

  // Reset isSuccessfullySaved when switching to edit
  useEffect(() => {
    setIsSuccessfullySaved(false);
  }, [editingId]);

  // Browser beforeunload protection against accidental close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasContent && !isSuccessfullySaved && !editingId) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasContent, isSuccessfullySaved, editingId]);

  // Handle Client selection - pulls all stored client data
  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const found = clients.find(c => c.id === clientId || c.name === clientId || c.dni === clientId);
    if (found) {
      setClientName(found.name);
      setClientRucDni(found.dni || '');
      setFiscalAddress(found.fiscalAddress || found.address || '');
      setDispatchAddress(found.address || '');
      setDispatchContactName(found.contactPerson || found.name || '');
      setDispatchContactPhone(found.phone || '');
      setBillingName(found.name);
      setBillingRucDni(found.dni || '');
    }
  };

  // Handle Seller selection
  const handleSelectSeller = (selId: string) => {
    setSellerId(selId);
    if (selId) {
      const found = sellers.find(s => s.id === selId || s.name === selId);
      if (found) setSellerName(found.name);
    }
  };

  // Item Field Change
  const handleItemChange = (index: number, field: keyof SalesOrderItem, value: any) => {
    setItems(prev => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };

      // Auto-lookup article when typing/selecting code or description
      if (field === 'code' && typeof value === 'string' && value.trim()) {
        const query = value.trim().toLowerCase();
        const found = articles.find(a => 
          (a.code && a.code.toLowerCase().trim() === query) || 
          (a.name && a.name.toLowerCase().trim() === query)
        );
        if (found) {
          updated.articleId = found.id;
          updated.description = found.name + (found.description ? ` (${found.description})` : '');
          if (found.code) updated.code = found.code;
        }
      } else if (field === 'description' && typeof value === 'string' && value.trim()) {
        const query = value.trim().toLowerCase();
        const found = articles.find(a => 
          (a.name && a.name.toLowerCase().trim() === query) || 
          (a.code && a.code.toLowerCase().trim() === query)
        );
        if (found) {
          updated.articleId = found.id;
          if (found.code) updated.code = found.code;
        }
      }

      // Recalculate total amount if price or dispatchedQty changes
      if (field === 'unitPrice' || field === 'dispatchedQty') {
        const price = field === 'unitPrice' ? Number(value) || 0 : updated.unitPrice;
        const qty = field === 'dispatchedQty' ? Number(value) || 0 : updated.dispatchedQty;
        updated.totalAmount = price * qty;
      }

      next[index] = updated;
      return next;
    });
  };

  // Add Item Row
  const handleAddItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length + 1}`,
        code: '',
        description: '',
        unitPrice: 0,
        requestedQty: 0,
        dispatchedQty: 0,
        totalAmount: 0
      }
    ]);
  };

  // Remove Item Row
  const handleRemoveItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Reset Form
  const handleResetForm = () => {
    setEditingId(null);
    setEditingOrderNo('');
    setSellerName(sellers.length > 0 ? sellers[0].name : currentOperator);
    setSellerId(sellers.length > 0 ? sellers[0].id : '');
    setDate(new Date().toISOString().split('T')[0]);

    setSelectedClientId('');
    setClientName('');
    setClientRucDni('');
    setFiscalAddress('');
    setDispatchContactName('');
    setDispatchContactPhone('');
    setDispatchAddress('');
    setFloorNumber('');
    setDispatchDate(new Date().toISOString().split('T')[0]);
    setDispatchTime('09:00');
    setPaymentMethod('Contado');

    setBilledAmount('');
    setBillingName('');
    setBillingRucDni('');
    setPendingAmount('');
    setObservations('');

    setItems([
      {
        id: `item-${Date.now()}-1`,
        code: '',
        description: '',
        unitPrice: 0,
        requestedQty: 0,
        dispatchedQty: 0,
        totalAmount: 0
      }
    ]);

    localStorage.removeItem("texflow_draft_salesorder");
    setLastSavedDraftTime(null);
  };

  // Save Sales Order
  const handleSaveOrder = async (shouldPrint = false) => {
    if (!clientName.trim()) {
      const diag = {
        title: 'Cliente Requerido',
        message: 'Por favor ingrese o seleccione el nombre del Cliente.',
        rootCause: 'El campo de Cliente se encuentra en blanco.',
        solution: 'Seleccione un cliente del catálogo o escriba el nombre/razón social en el casillero correspondiente.'
      };
      toast.warning(diag.message, {
        title: diag.title,
        rootCause: diag.rootCause,
        solution: diag.solution
      });
      return;
    }

    // Identify truly empty rows (all fields empty or zero)
    const isRowEmpty = (i: SalesOrderItem) => {
      const hasCode = (i.code || '').trim() !== '';
      const hasDesc = (i.description || '').trim() !== '';
      const hasReqQty = (Number(i.requestedQty) || 0) > 0;
      const hasDispQty = (Number(i.dispatchedQty) || 0) > 0;
      const hasPrice = (Number(i.unitPrice) || 0) > 0;
      const hasTotal = (Number(i.totalAmount) || 0) > 0;
      return !hasCode && !hasDesc && !hasReqQty && !hasDispQty && !hasPrice && !hasTotal;
    };

    // Rows that have any data at all
    const filledRows = items.filter(i => !isRowEmpty(i));

    // Valid items must have description/code to be saved as an actual product item
    const validItems = filledRows.filter(
      i => (i.description || '').trim() !== '' || (i.code || '').trim() !== ''
    );

    // Incomplete rows: have quantity, price or total amount but lack both description and code
    const incompleteRows = filledRows.filter(
      i => (i.description || '').trim() === '' && (i.code || '').trim() === ''
    );

    if (incompleteRows.length > 0) {
      const diag = {
        title: 'Filas Incompletas',
        message: `Hay ${incompleteRows.length} fila(s) con precio o cantidad pero sin artículo/descripción. Por favor asigne el producto o complete la descripción antes de guardar.`,
        rootCause: 'Se ingresó cantidad solicitada/precio unitario en una fila pero se dejó la descripción y código en blanco.',
        solution: 'Seleccione el artículo del catálogo o ingrese la descripción para cada fila con metraje/precio cargado.'
      };
      toast.warning(diag.message, {
        title: diag.title,
        rootCause: diag.rootCause,
        solution: diag.solution
      });
      return;
    }

    if (validItems.length === 0) {
      const diag = {
        title: 'Artículos Requeridos',
        message: 'Por favor ingrese al menos un artículo o producto con su descripción.',
        rootCause: 'No se encontraron filas válidas en la tabla de productos.',
        solution: 'Ingrese el código o descripción, metraje solicitado y precio en la tabla de artículos de la venta.'
      };
      toast.warning(diag.message, {
        title: diag.title,
        rootCause: diag.rootCause,
        solution: diag.solution
      });
      return;
    }

    setLoading(true);

    const generatedOrderNo = (editingId && editingOrderNo) ? editingOrderNo : `FV-${Date.now()}`;

    const payload: Omit<SalesOrder, 'id'> = {
      orderNo: generatedOrderNo,
      sellerId: sellerId || '',
      sellerName: sellerName.trim() || currentOperator,
      date: date || new Date().toISOString().split('T')[0],
      clientId: selectedClientId || '',
      clientName: clientName.trim(),
      clientRucDni: clientRucDni.trim(),
      fiscalAddress: fiscalAddress.trim(),
      dispatchContactName: dispatchContactName.trim(),
      dispatchContactPhone: dispatchContactPhone.trim(),
      dispatchAddress: dispatchAddress.trim(),
      floorNumber: floorNumber.trim(),
      dispatchDate: dispatchDate || '',
      dispatchTime: dispatchTime || '',
      paymentMethod: paymentMethod || '',
      billedAmount: Number(billedAmount) || 0,
      billingName: billingName.trim(),
      billingRucDni: billingRucDni.trim(),
      pendingAmount: Number(pendingAmount) || 0,
      observations: observations.trim(),
      items: validItems.map(i => ({
        id: i.id,
        articleId: i.articleId || '',
        code: (i.code || '').trim(),
        description: (i.description || '').trim(),
        unitPrice: Number(i.unitPrice) || 0,
        requestedQty: Number(i.requestedQty) || 0,
        dispatchedQty: Number(i.dispatchedQty) || 0,
        totalAmount: Number(i.totalAmount) || 0
      })),
      totalAmount: computedTotal,
      createdAt: new Date().toISOString(),
      appVersion: '2.6r'
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'sales_orders', editingId), payload);
        const fullSaved: SalesOrder = { id: editingId, ...payload };
        toast.success(`Orden de Venta ${payload.orderNo} guardada con éxito`);
        if (shouldPrint) setPrintOrder(fullSaved);
      } else {
        const res = await addDoc(collection(db, 'sales_orders'), payload);
        const fullSaved: SalesOrder = { id: res.id, ...payload };
        toast.success(`Orden de Venta ${payload.orderNo} registrada en el sistema`);
        localStorage.removeItem("texflow_draft_salesorder");
        setIsSuccessfullySaved(true);
        setLastSavedDraftTime(null);
        if (shouldPrint) setPrintOrder(fullSaved);
        handleResetForm();
      }
    } catch (err: any) {
      console.error('Error saving sales order:', err);
      toast.diagnose(err, { action: 'guardar la Orden de Venta', entity: 'sales_orders' });
    } finally {
      setLoading(false);
    }
  };

  // Edit Order Load
  const handleEditOrder = (order: SalesOrder) => {
    setEditingId(order.id);
    setEditingOrderNo(order.orderNo || '');
    setSellerName(order.sellerName || '');
    setSellerId(order.sellerId || '');
    setDate(order.date || new Date().toISOString().split('T')[0]);

    setSelectedClientId(order.clientId || '');
    setClientName(order.clientName || '');
    setClientRucDni(order.clientRucDni || '');
    setFiscalAddress(order.fiscalAddress || '');
    setDispatchContactName(order.dispatchContactName || '');
    setDispatchContactPhone(order.dispatchContactPhone || '');
    setDispatchAddress(order.dispatchAddress || '');
    setFloorNumber(order.floorNumber || '');
    setDispatchDate(order.dispatchDate || '');
    setDispatchTime(order.dispatchTime || '');
    setPaymentMethod(order.paymentMethod || 'Contado');

    setBilledAmount(order.billedAmount || '');
    setBillingName(order.billingName || '');
    setBillingRucDni(order.billingRucDni || '');
    setPendingAmount(order.pendingAmount || '');
    setObservations(order.observations || '');

    setItems(order.items && order.items.length > 0 ? order.items : [
      {
        id: `item-${Date.now()}-1`,
        code: '',
        description: '',
        unitPrice: 0,
        requestedQty: 0,
        dispatchedQty: 0,
        totalAmount: 0
      }
    ]);

    setViewMode('create');
  };

  // Delete Order
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'sales_orders', deleteTarget.id));
      toast.success('Orden de Venta eliminada correctamente.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.diagnose(err, { action: 'eliminar la orden de venta', entity: 'sales_orders' });
    }
  };

  // Filtered Orders for History tab
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o => 
      (o.orderNo || '').toLowerCase().includes(q) ||
      (o.clientName || '').toLowerCase().includes(q) ||
      (o.clientRucDni || '').toLowerCase().includes(q) ||
      (o.sellerName || '').toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Draft Recovery Dialog */}
      {showRecoveryPrompt && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden text-app-text">
            {/* Header */}
            <div className="bg-amber-500/10 border-b border-amber-500/20 p-4 sm:p-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ClipboardList size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-app-text">Borrador Detectado</h4>
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-0.5">
                  Orden de Venta sin guardar
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 sm:p-6 space-y-4">
              <p className="text-xs text-app-text/80 leading-relaxed">
                Se encontró una Orden de Venta que quedó pendiente en una sesión anterior. ¿Deseas recuperarla para continuar o prefieres descartarla?
              </p>
              
              <div className="bg-app-bg border border-app-border/80 rounded-lg p-3 text-[11px] space-y-1.5 text-app-text/75 font-mono">
                <div>• <strong>Cliente:</strong> <span className="font-sans">{draftData?.clientName || 'No especificado'}</span></div>
                {draftData?.clientRucDni && (
                  <div>• <strong>RUC / DNI:</strong> {draftData.clientRucDni}</div>
                )}
                <div>• <strong>Productos:</strong> <span className="font-sans">{draftData?.items?.length || 0} producto(s)</span></div>
                {draftData?.savedAt && (
                  <div className="text-[10px] text-app-text/50 pt-1 font-sans border-t border-app-border/50">
                    Guardado: {new Date(draftData.savedAt).toLocaleString('es-PE')}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-app-bg px-5 py-3.5 border-t border-app-border flex justify-end gap-2.5">
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-3.5 py-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 border border-app-border rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleRecoverDraft}
                className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <RotateCcw size={13} />
                Recuperar Orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-app-surface border border-app-border rounded-xl p-4 sm:p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary">
              <ClipboardList size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-app-text tracking-tight">Órdenes de Venta</h1>
              <p className="text-xs text-app-text/60">
                Registro, consulta e impresión de órdenes de venta para clientes y almacén
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 bg-app-bg p-1 rounded-lg border border-app-border">
          <button
            onClick={() => setViewMode('create')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              viewMode === 'create'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/70 hover:text-app-text hover:bg-app-surface'
            }`}
          >
            <Plus size={14} />
            {editingId ? 'Editar Orden' : 'Nueva Orden'}
          </button>

          <button
            onClick={() => setViewMode('history')}
            className={`px-4 py-2 rounded-md text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              viewMode === 'history'
                ? 'bg-app-primary text-white shadow-xs'
                : 'text-app-text/70 hover:text-app-text hover:bg-app-surface'
            }`}
          >
            <FileText size={14} />
            Historial ({orders.length})
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: CREATE / EDIT FORM */}
      {viewMode === 'create' && (
        <div className="bg-app-surface border border-app-border rounded-xl p-4 sm:p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between border-b border-app-border/60 pb-3 gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-wider text-app-primary flex items-center gap-2">
                <ClipboardList size={16} />
                {editingId ? 'Edición de Orden de Venta' : 'Registro de Orden de Venta'}
              </h2>

              {!editingId && lastSavedDraftTime && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Borrador autoguardado ({lastSavedDraftTime})</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {editingId ? (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-xs text-app-text/60 hover:text-app-primary underline cursor-pointer"
                >
                  Cancelar Edición
                </button>
              ) : (
                hasContent && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="px-2.5 py-1 text-[11px] text-app-text/60 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md border border-app-border transition flex items-center gap-1 cursor-pointer"
                    title="Limpiar campos y descartar borrador"
                  >
                    <Trash2 size={12} />
                    Limpiar Formulario
                  </button>
                )
              )}
            </div>
          </div>

          {/* Form Top Section: Seller and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-app-bg/40 p-4 rounded-xl border border-app-border">
            <div>
              <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                Asesor Comercial
              </label>
              <input
                type="text"
                list="sellers-datalist"
                value={sellerName}
                onChange={e => {
                  const val = e.target.value;
                  setSellerName(val);
                  const valClean = (val || '').toLowerCase().trim();
                  const found = sellers.find(s => (s.name || '').toLowerCase().trim() === valClean || s.id === val);
                  if (found) {
                    setSellerId(found.id);
                    setSellerName(found.name);
                  } else {
                    setSellerId('');
                  }
                }}
                placeholder="Escriba o seleccione asesor comercial..."
                className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 font-medium transition-colors"
              />
              <datalist id="sellers-datalist">
                {sellers.map(s => (
                  <option key={s.id} value={s.name}>
                    {s.email ? `(${s.email})` : ''}
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                Fecha de Emisión
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono shadow-2xs focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
              />
            </div>
          </div>

          {/* Form Section 2: Items Table / Mobile Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-app-text/80 flex items-center gap-1.5">
                <FileText size={14} className="text-app-primary" />
                Detalle de Productos / Telas Solicitadas
              </h3>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="px-3 py-1.5 bg-app-primary/10 hover:bg-app-primary/20 text-app-primary font-bold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer border border-app-primary/30"
              >
                <Plus size={14} />
                Agregar Fila
              </button>
            </div>

            {/* Mobile View: Vertical Stacked Cards (below md) */}
            <div className="space-y-3.5 md:hidden">
              {items.map((item, index) => (
                <div 
                  key={item.id} 
                  className="bg-app-bg/50 border border-app-border rounded-xl p-3.5 space-y-3 shadow-2xs relative"
                >
                  {/* Card Header: Product Index and Delete button */}
                  <div className="flex items-center justify-between border-b border-app-border/60 pb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-app-primary">
                      <span className="h-5 w-5 rounded-full bg-app-primary/10 flex items-center justify-center text-[11px] font-mono font-bold">
                        {index + 1}
                      </span>
                      Producto / Tela
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(index)}
                      disabled={items.length === 1}
                      className="p-1.5 text-app-text/40 hover:text-red-600 disabled:opacity-20 transition cursor-pointer rounded-md hover:bg-red-50 dark:hover:bg-red-950/20"
                      title="Eliminar producto"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Code & Description Fields */}
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Código de Producto
                      </label>
                      <input
                        type="text"
                        list={`art-code-list-mob-${index}`}
                        value={item.code}
                        onChange={e => handleItemChange(index, 'code', e.target.value)}
                        placeholder="Buscar o ingresar código..."
                        className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs font-mono font-bold shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                      />
                      <datalist id={`art-code-list-mob-${index}`}>
                        {articles.map(a => (
                          <option key={a.id} value={a.code || a.name}>
                            {a.name} {a.description ? `(${a.description})` : ''}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Descripción / Tela
                      </label>
                      <input
                        type="text"
                        list={`art-desc-list-mob-${index}`}
                        value={item.description}
                        onChange={e => handleItemChange(index, 'description', e.target.value)}
                        placeholder="Descripción de la tela o producto..."
                        className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 font-medium transition-colors"
                      />
                      <datalist id={`art-desc-list-mob-${index}`}>
                        {articles.map(a => (
                          <option key={a.id} value={a.name}>
                            {a.code ? `[${a.code}] ` : ''}{a.description || ''}
                          </option>
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* Quantity & Price 2x2 Grid */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Precio Unit. (S/.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice || ''}
                        onChange={e => handleItemChange(index, 'unitPrice', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs font-mono text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Cant. Solicitada
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.requestedQty || ''}
                        onChange={e => handleItemChange(index, 'requestedQty', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs font-mono text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Cant. Despachada
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.dispatchedQty || ''}
                        onChange={e => handleItemChange(index, 'dispatchedQty', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs font-mono font-bold text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-app-text/70 uppercase tracking-wider mb-1">
                        Importe Total (S/.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.totalAmount || ''}
                        onChange={e => handleItemChange(index, 'totalAmount', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2.5 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs font-mono font-bold text-right text-app-primary shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Card Row Subtotal Summary */}
                  <div className="bg-app-surface border border-app-border/80 rounded-lg px-3 py-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-app-text/60 font-semibold uppercase tracking-wider text-[10px]">Subtotal Fila</span>
                    <span className="font-mono font-bold text-app-primary">
                      S/. {(Number(item.totalAmount) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}

              {/* Mobile Total General Card */}
              <div className="bg-app-bg border border-app-border rounded-xl p-3.5 flex items-center justify-between font-bold text-xs shadow-2xs">
                <span className="uppercase text-app-text/80 tracking-wider">TOTAL GENERAL (S/.):</span>
                <span className="font-mono text-base font-black text-app-primary">
                  S/. {computedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Desktop View: Classical Table (md and above) */}
            <div className="hidden md:block overflow-x-auto border border-app-border rounded-lg shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-app-bg/80 border-b border-app-border text-app-text/60 font-semibold uppercase text-[10px]">
                    <th className="p-2.5 w-[16%]">Código</th>
                    <th className="p-2.5 w-[36%]">Descripción / Tela</th>
                    <th className="p-2.5 w-[12%] text-right">Precio Unit. (S/.)</th>
                    <th className="p-2.5 w-[11%] text-right">Cant. Solicitada</th>
                    <th className="p-2.5 w-[11%] text-right">Cant. Despachada</th>
                    <th className="p-2.5 w-[12%] text-right">Importe Total (S/.)</th>
                    <th className="p-2.5 w-[2%] text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/60">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-app-bg/20">
                      {/* Code input with autocomplete */}
                      <td className="p-2">
                        <input
                          type="text"
                          list={`art-code-list-${index}`}
                          value={item.code}
                          onChange={e => handleItemChange(index, 'code', e.target.value)}
                          placeholder="Código..."
                          className="w-full px-2 py-1.5 border border-app-input-border rounded bg-app-input-bg text-[11px] font-mono font-bold shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                        />
                        <datalist id={`art-code-list-${index}`}>
                          {articles.map(a => (
                            <option key={a.id} value={a.code || a.name}>
                              {a.name} {a.description ? `(${a.description})` : ''}
                            </option>
                          ))}
                        </datalist>
                      </td>

                      {/* Description with autocomplete */}
                      <td className="p-2">
                        <input
                          type="text"
                          list={`art-desc-list-${index}`}
                          value={item.description}
                          onChange={e => handleItemChange(index, 'description', e.target.value)}
                          placeholder="Descripción del producto o tela..."
                          className="w-full px-2 py-1.5 border border-app-input-border rounded bg-app-input-bg text-[11px] shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 font-medium transition-colors"
                        />
                        <datalist id={`art-desc-list-${index}`}>
                          {articles.map(a => (
                            <option key={a.id} value={a.name}>
                              {a.code ? `[${a.code}] ` : ''}{a.description || ''}
                            </option>
                          ))}
                        </datalist>
                      </td>

                      {/* Unit Price */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice || ''}
                          onChange={e => handleItemChange(index, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1 border border-app-input-border rounded bg-app-input-bg text-[11px] font-mono text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                        />
                      </td>

                      {/* Requested Qty */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.requestedQty || ''}
                          onChange={e => handleItemChange(index, 'requestedQty', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1 border border-app-input-border rounded bg-app-input-bg text-[11px] font-mono text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                        />
                      </td>

                      {/* Dispatched Qty */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.dispatchedQty || ''}
                          onChange={e => handleItemChange(index, 'dispatchedQty', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1 border border-app-input-border rounded bg-app-input-bg text-[11px] font-mono font-bold text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                        />
                      </td>

                      {/* Total Amount */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.totalAmount || ''}
                          onChange={e => handleItemChange(index, 'totalAmount', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1 border border-app-input-border rounded bg-app-input-bg text-[11px] font-mono font-bold text-right shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                        />
                      </td>

                      {/* Remove Row */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(index)}
                          disabled={items.length === 1}
                          className="text-app-text/40 hover:text-red-600 disabled:opacity-20 transition cursor-pointer"
                          title="Eliminar fila"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-app-bg/60 border-t border-app-border font-bold">
                    <td colSpan={5} className="p-2.5 text-right uppercase text-xs">
                      TOTAL GENERAL (S/.):
                    </td>
                    <td className="p-2.5 text-right font-mono text-sm font-black text-app-primary">
                      S/. {computedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Form Section 3: Client & Fiscal Info */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text/80 flex items-center gap-1.5 border-b border-app-border/60 pb-2">
              <User size={14} className="text-app-primary" />
              1. Datos Fiscales del Cliente (SUNAT / Facturación)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Cliente (Nombre o Razón Social)
                </label>
                <input
                  type="text"
                  list="client-name-datalist"
                  value={clientName}
                  onChange={e => {
                    const val = e.target.value;
                    setClientName(val);
                    const valClean = (val || '').toLowerCase().trim();
                    const found = clients.find(c => 
                      (c.name || '').toLowerCase().trim() === valClean ||
                      (c.dni && c.dni.toLowerCase().trim() === valClean)
                    );
                    if (found) {
                      handleSelectClient(found.id);
                    }
                  }}
                  placeholder="Ej. Comercializadora Textil S.A.C. / Nombre Apellidos"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-bold shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
                <datalist id="client-name-datalist">
                  {clients.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.dni ? `[${c.dni}] ` : ''}{c.contactPerson ? `Encargado: ${c.contactPerson}` : ''}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  RUC / DNI
                </label>
                <input
                  type="text"
                  value={clientRucDni}
                  onChange={e => {
                    const val = e.target.value;
                    setClientRucDni(val);
                    if (val.trim()) {
                      const valClean = (val || '').trim().toLowerCase();
                      const found = clients.find(c => 
                        (c.dni && (c.dni || '').toString().trim().toLowerCase() === valClean) ||
                        (c.name && (c.name || '').toString().trim().toLowerCase() === valClean)
                      );
                      if (found) {
                        handleSelectClient(found.id);
                      }
                    }
                  }}
                  placeholder="Ej. 20601234567 (RUC) o 45678912 (DNI)"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>
            </div>

            <div className="bg-app-bg/40 p-3 rounded-lg border border-app-border/80">
              <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                <span>Dirección Fiscal (Registrada en SUNAT / Domicilio)</span>
                <span className="text-[10px] text-app-text/50 normal-case font-normal">Incluye calle, distrito, provincia y departamento</span>
              </label>
              <input
                type="text"
                value={fiscalAddress}
                onChange={e => setFiscalAddress(e.target.value)}
                placeholder="Ej. Av. Nicolás Ayllón 1234 - San Luis - Lima - Lima"
                className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
              />
            </div>
          </div>

          {/* Form Section 4: Dispatch & Physical Delivery Info */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text/80 flex items-center gap-1.5 border-b border-app-border/60 pb-2">
              <Truck size={14} className="text-app-primary" />
              2. Lugar y Datos de Despacho / Entrega (Logística Física)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Contacto de Despacho (Persona en Destino)
                </label>
                <input
                  type="text"
                  value={dispatchContactName}
                  onChange={e => setDispatchContactName(e.target.value)}
                  placeholder="Nombre de la persona que recibe la mercadería"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={dispatchContactPhone}
                  onChange={e => setDispatchContactPhone(e.target.value)}
                  placeholder="Ej. 987654321"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-app-text/80 uppercase tracking-wider">
                    Lugar / Dirección de Entrega (Punto Físico / Agencia)
                  </label>
                  {fiscalAddress && (
                    <button
                      type="button"
                      onClick={() => setDispatchAddress(fiscalAddress)}
                      className="text-[10px] font-semibold text-app-primary hover:underline cursor-pointer"
                    >
                      Copiar Dirección Fiscal
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={dispatchAddress}
                  onChange={e => setDispatchAddress(e.target.value)}
                  placeholder="Lugar de Entrega, Agencia de Transporte, Almacén o Tienda"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Piso / Referencia de Destino
                </label>
                <input
                  type="text"
                  value={floorNumber}
                  onChange={e => setFloorNumber(e.target.value)}
                  placeholder="Ej. Piso 2 / Frente a Parque"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Fecha de Despacho
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={dispatchDate}
                  onChange={e => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono shadow-2xs focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Hora de Despacho / Turno
                </label>
                <input
                  type="text"
                  list="dispatch-time-list"
                  value={dispatchTime}
                  onChange={e => setDispatchTime(e.target.value)}
                  placeholder="Ej. Por la mañana, 9:00 AM, etc."
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
                <datalist id="dispatch-time-list">
                  <option value="Por la mañana">Por la mañana (8:00 AM - 12:00 PM)</option>
                  <option value="Por la tarde">Por la tarde (2:00 PM - 6:00 PM)</option>
                  <option value="09:00 AM">09:00 AM</option>
                  <option value="11:00 AM">11:00 AM</option>
                  <option value="02:00 PM">02:00 PM</option>
                  <option value="04:00 PM">04:00 PM</option>
                  <option value="Horario de oficina">Horario de oficina</option>
                  <option value="Urgente / Inmediato">Urgente / Inmediato</option>
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Forma de Pago
                </label>
                <input
                  type="text"
                  list="payment-methods-list"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  placeholder="Seleccione o escriba forma de pago..."
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-semibold shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
                <datalist id="payment-methods-list">
                  <option value="Contado">Contado</option>
                  <option value="Crédito 15 días">Crédito 15 días</option>
                  <option value="Crédito 30 días">Crédito 30 días</option>
                  <option value="50% Adelanto, 50% Contra Entrega">50% Adelanto, 50% Contra Entrega</option>
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Yape / Plin">Yape / Plin</option>
                  <option value="Cheque a 30 días">Cheque a 30 días</option>
                  <option value="Contra Entrega">Contra Entrega</option>
                </datalist>
              </div>
            </div>
          </div>

          {/* Form Section 4: Facturación & Importes (Opcional) */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-text/80 flex items-center justify-between border-b border-app-border/60 pb-2">
              <span className="flex items-center gap-1.5">
                <DollarSign size={14} className="text-app-primary" />
                Detalle de Facturación e Importes
              </span>
              <span className="text-[10px] font-normal text-app-text/50 lowercase italic">
                (opcional - complete si lo requiere)
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-app-bg/30 p-4 rounded-lg border border-app-border">
              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Importe Facturado (S/.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={billedAmount}
                  onChange={e => setBilledAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono font-bold shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Nombre Razón Social Factura
                </label>
                <input
                  type="text"
                  value={billingName}
                  onChange={e => setBillingName(e.target.value)}
                  placeholder="Nombre en Factura"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  RUC/DNI Factura
                </label>
                <input
                  type="text"
                  value={billingRucDni}
                  onChange={e => setBillingRucDni(e.target.value)}
                  placeholder="RUC de Factura"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
                  Importe Pendiente (S/.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={pendingAmount}
                  onChange={e => setPendingAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs font-mono font-bold text-red-600 shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Form Section 5: Observaciones */}
          <div>
            <label className="block text-[11px] font-bold text-app-text/80 mb-1.5 uppercase tracking-wider">
              Observaciones
            </label>
            <textarea
              rows={2}
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Notas adicionales sobre la entrega, corte o embalaje..."
              className="w-full px-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-app-text text-xs shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
            />
          </div>

          {/* Form Submit Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-app-border/60 pt-4">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 border border-app-border rounded-lg text-xs font-bold text-app-text/70 hover:bg-app-bg transition cursor-pointer"
            >
              Limpiar Formulario
            </button>

            <button
              type="button"
              onClick={() => handleSaveOrder(false)}
              disabled={loading}
              className="px-5 py-2.5 bg-app-surface border border-app-primary text-app-primary hover:bg-app-primary/10 font-bold text-xs rounded-lg transition shadow-2xs flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle size={15} />
              Guardar Orden
            </button>

            <button
              type="button"
              onClick={() => handleSaveOrder(true)}
              disabled={loading}
              className="px-6 py-2.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold text-xs rounded-lg transition shadow-md flex items-center gap-2 cursor-pointer uppercase tracking-wider"
            >
              <Printer size={15} />
              Guardar e Imprimir
            </button>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: HISTORY LIST */}
      {viewMode === 'history' && (
        <div className="bg-app-surface border border-app-border rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text/40" />
              <input
                type="text"
                placeholder="Buscar por N° de orden, cliente, RUC/DNI o vendedor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-app-input-border rounded-lg bg-app-input-bg text-xs text-app-text shadow-2xs placeholder:text-app-text/35 focus:outline-hidden focus:border-app-primary focus:ring-2 focus:ring-app-primary/15 transition-colors"
              />
            </div>

            <button
              onClick={() => {
                handleResetForm();
                setViewMode('create');
              }}
              className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <Plus size={14} />
              Nueva Orden
            </button>
          </div>

          {/* Mobile History Cards View (below md) */}
          <div className="space-y-3 md:hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-app-text/50 border border-app-border rounded-xl bg-app-bg/30 text-xs">
                No se encontraron órdenes de venta registradas.
              </div>
            ) : (
              filteredOrders.map(order => (
                <div 
                  key={order.id}
                  className="bg-app-bg/50 border border-app-border rounded-xl p-4 space-y-3 shadow-2xs"
                >
                  {/* Top Bar: Date & Total Amount */}
                  <div className="flex items-center justify-between border-b border-app-border/60 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-app-text/70">
                      <Calendar size={13} className="text-app-primary" />
                      <span>{order.date}</span>
                    </div>
                    <span className="font-mono text-sm font-black text-app-primary">
                      S/. {(order.totalAmount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Client and Seller Info */}
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-app-text">{order.clientName}</div>
                    {order.clientRucDni && (
                      <div className="text-[11px] font-mono text-app-text/60">
                        Doc: {order.clientRucDni}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-app-text/70">
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-app-text/40" />
                        {order.sellerName || 'Sin vendedor'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-app-surface border border-app-border text-[10px] font-semibold">
                        {order.items?.length || 0} producto(s)
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border/60">
                    <button
                      onClick={() => setPrintOrder(order)}
                      className="px-3 py-1.5 bg-app-primary/10 hover:bg-app-primary/20 text-app-primary rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={13} />
                      Imprimir
                    </button>

                    <button
                      onClick={() => handleEditOrder(order)}
                      className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit2 size={13} />
                      Editar
                    </button>

                    <button
                      onClick={() => setDeleteTarget(order)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition cursor-pointer"
                      title="Eliminar Orden"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop History Table View (md and above) */}
          <div className="hidden md:block overflow-x-auto border border-app-border rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-app-bg/60 border-b border-app-border text-app-text/60 font-bold uppercase text-[10px]">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Ejecutor Ventas</th>
                  <th className="p-3">Items</th>
                  <th className="p-3 text-right">Total (S/.)</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border/60">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-app-text/50">
                      No se encontraron órdenes de venta registradas.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-app-bg/30 transition">
                      <td className="p-3 font-mono text-app-text/70">{order.date}</td>
                      <td className="p-3">
                        <div className="font-bold text-app-text">{order.clientName}</div>
                        <div className="text-[10px] font-mono text-app-text/50">{order.clientRucDni}</div>
                      </td>
                      <td className="p-3 font-medium text-app-text/80">{order.sellerName || '-'}</td>
                      <td className="p-3 text-app-text/70">
                        {order.items?.length || 0} producto(s)
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-app-text">
                        S/. {(order.totalAmount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setPrintOrder(order)}
                            className="p-1.5 bg-app-primary/10 hover:bg-app-primary/20 text-app-primary rounded transition cursor-pointer"
                            title="Ver / Imprimir Orden"
                          >
                            <Printer size={14} />
                          </button>

                          <button
                            onClick={() => handleEditOrder(order)}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded transition cursor-pointer"
                            title="Editar Orden"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(order)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded transition cursor-pointer"
                            title="Eliminar Orden"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load More Sales Orders */}
          {ordersHasMore && (
            <div className="pt-2 flex justify-center items-center">
              <button
                type="button"
                onClick={() => setOrdersLimit(prev => prev + 200)}
                className="px-4 py-2 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded-lg text-xs font-bold transition flex items-center gap-2 uppercase tracking-wider cursor-pointer shadow-xs"
                id="btn-load-more-sales-orders"
              >
                <RefreshCw size={13} className="text-app-text/50" />
                Cargar más
              </button>
            </div>
          )}
        </div>
      )}

      {/* PRINT MODAL OVERLAY */}
      {printOrder && (
        <PrintSalesOrder
          order={printOrder}
          clients={clients}
          sellers={sellers}
          articles={articles}
          onClose={() => setPrintOrder(null)}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-app-surface border border-app-border rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-base">Eliminar Orden de Venta</h3>
            </div>

            <p className="text-xs text-app-text/80 leading-relaxed">
              ¿Está seguro de que desea eliminar permanentemente la Orden de Venta para el cliente{' '}
              <strong>{deleteTarget.clientName}</strong>? Esta acción no se puede deshacer.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-app-border rounded-lg text-xs font-bold text-app-text/70 hover:bg-app-bg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer"
              >
                Eliminar Definidamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
