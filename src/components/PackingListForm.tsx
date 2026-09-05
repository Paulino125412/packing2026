import React, { useState, useEffect, useMemo } from 'react';
import { Client, Seller, Provider, Article, RollItem, PackingList, PackingListItem } from '../types';
import { db, addDoc, updateDoc, runTransaction, fetchAllInventoryDocs, findRollInInventory, fetchAllPackingLists } from '../firebase';
import { collection, doc } from 'firebase/firestore';
import { Plus, Trash2, Calendar, User, ShoppingBag, CheckCircle2, ChevronRight, Hash, Ruler, X, FileText, Layers, Truck, AlertTriangle, Clock, Scissors, Archive } from 'lucide-react';
import SearchableCombobox from './SearchableCombobox';
import { FormRollEntry, FormArticleGroup } from './packing-list-form/types';
import { resolveColumnsForText, parseSanitizedNumeric } from './packing-list-form/ExcelPasteParser';
import ClientSellerSelector from './packing-list-form/ClientSellerSelector';
import ArticleGroupSection from './packing-list-form/ArticleGroupSection';
import AlertBanner from './AlertBanner';
import PrintRestingGuideModal from './PrintRestingGuideModal';
import { useToast } from '../context/ToastContext';
import { analyzeSystemError } from '../lib/diagnostics';

interface PackingListFormProps {
  clients: Client[];
  sellers: Seller[];
  providers: Provider[];
  articles: Article[];
  inventory: RollItem[];
  packingLists: PackingList[];
  inventoryHasMore?: boolean;
  onRefresh: () => Promise<void>;
  onPackingListCreated: (pl: PackingList) => void;
  currentOperator: string;
  editingPackingList?: PackingList | null;
  isDuplicate?: boolean;
  onCancelEdit?: (goToHistory?: boolean) => void;
}

export default function PackingListForm({
  clients,
  sellers,
  providers,
  articles,
  inventory,
  packingLists,
  inventoryHasMore = false,
  onRefresh,
  onPackingListCreated,
  currentOperator,
  editingPackingList = null,
  isDuplicate = false,
  onCancelEdit
}: PackingListFormProps) {
  const [packingType, setPackingType] = useState<'nuevo' | 'antiguo' | 'corte'>('nuevo');
  const [clientId, setClientId] = useState('');
  const [sellerId, setSellerId] = useState('');

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const minDocDate = useMemo(() => {
    if (editingPackingList && !isDuplicate && editingPackingList.date) {
      return editingPackingList.date < todayStr ? editingPackingList.date : todayStr;
    }
    return todayStr;
  }, [editingPackingList, isDuplicate, todayStr]);

  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [notes, setNotes] = useState('');
  const [formProviderId, setFormProviderId] = useState('');
  const [guideNumber, setGuideNumber] = useState('');
  const [dispatchAddress, setDispatchAddress] = useState('');
  
  // Nested structure state: Article Sections containing multiple rolls
  const [articleGroups, setArticleGroups] = useState<FormArticleGroup[]>([]);
  
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    title?: string;
    rootCause?: string;
    solution?: string;
    technicalDetails?: string;
  } | string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [hasCheckedDraft, setHasCheckedDraft] = useState(false);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [isSuccessfullySaved, setIsSuccessfullySaved] = useState(false);

  // Reset confirmation state
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Technical Resting Guide Modal State
  const [showRestingGuide, setShowRestingGuide] = useState(false);

  // Missing provider fields confirmation state
  const [missingFieldsConfirm, setMissingFieldsConfirm] = useState<{
    fields: string[];
    onConfirm: () => void;
  } | null>(null);

  // Form content presence check
  const hasContent = useMemo(() => {
    return !!(
      clientId || 
      sellerId ||
      notes.trim() || 
      formProviderId || 
      guideNumber.trim() || 
      dispatchAddress.trim() || 
      articleGroups.length > 1 || 
      (articleGroups[0] && (articleGroups[0].articleId || articleGroups[0].rolls.length > 0))
    );
  }, [clientId, sellerId, notes, formProviderId, guideNumber, dispatchAddress, articleGroups]);

  const liveStats = useMemo(() => {
    let totalRolls = 0;
    let totalMeters = 0;
    let totalWeight = 0;
    articleGroups.forEach(g => {
      g.rolls.forEach(r => {
        totalRolls++;
        totalMeters += Number(r.meters) || 0;
        const wStr = (r.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
        const wNum = parseFloat(wStr);
        if (!isNaN(wNum) && isFinite(wNum) && wNum > 0) {
          totalWeight += wNum;
        }
      });
    });
    return {
      totalRolls,
      totalMeters: Number(totalMeters.toFixed(2)),
      totalWeight: Number(totalWeight.toFixed(2)),
      articleCount: articleGroups.filter(g => g.articleId || g.rolls.length > 0).length
    };
  }, [articleGroups]);

  // Reusable function to completely reset form state
  const resetFormState = () => {
    setClientId('');
    setSellerId('');
    setNotes('');
    setFormProviderId('');
    setGuideNumber('');
    setDispatchAddress('');
    setDocDate(new Date().toISOString().split('T')[0]);
    setPackingType('nuevo');
    setArticleGroups([
      {
        id: `group-${Date.now()}-${Math.random()}`,
        providerId: '',
        articleId: '',
        lot: '',
        partida: '',
        tono: '',
        source: 'custom',
        rolls: []
      }
    ]);
  };

  const handleConfirmReset = () => {
    resetFormState();
    localStorage.removeItem("texflow_draft_packinglist");
    if (editingPackingList || isDuplicate) {
      onCancelEdit?.(false);
    }
    setIsResetConfirmOpen(false);
  };

  // Check for saved draft on mount (only if not editing or duplicating)
  useEffect(() => {
    if (!editingPackingList && !isDuplicate) {
      try {
        const saved = localStorage.getItem("texflow_draft_packinglist");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.clientId || parsed.sellerId || parsed.notes || (parsed.articleGroups && parsed.articleGroups.length > 0 && parsed.articleGroups.some((g: any) => g.articleId || g.rolls?.length > 0)))) {
            setDraftData(parsed);
            setShowRecoveryPrompt(true);
            return;
          }
        }
      } catch (e) {
        console.error("Error reading draft from localStorage", e);
      }
    }
    setHasCheckedDraft(true);
  }, [editingPackingList, isDuplicate]);

  const handleRecoverDraft = () => {
    if (draftData) {
      if (draftData.packingType) setPackingType(draftData.packingType);
      if (draftData.clientId) setClientId(draftData.clientId);
      if (draftData.sellerId) setSellerId(draftData.sellerId);
      if (draftData.docDate) setDocDate(draftData.docDate);
      if (draftData.notes) setNotes(draftData.notes);
      if (draftData.formProviderId) setFormProviderId(draftData.formProviderId);
      if (draftData.articleGroups) setArticleGroups(draftData.articleGroups);
      if (draftData.guideNumber) setGuideNumber(draftData.guideNumber);
      if (draftData.dispatchAddress) setDispatchAddress(draftData.dispatchAddress);
    }
    setShowRecoveryPrompt(false);
    setHasCheckedDraft(true);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem("texflow_draft_packinglist");
    setShowRecoveryPrompt(false);
    setHasCheckedDraft(true);
  };

  // Auto-save form draft to localStorage when states change
  useEffect(() => {
    if (hasCheckedDraft && !editingPackingList && !isDuplicate) {
      if (hasContent) {
        const draftObj = {
          packingType,
          clientId,
          sellerId,
          docDate,
          notes,
          formProviderId,
          articleGroups,
          guideNumber,
          dispatchAddress
        };
        localStorage.setItem("texflow_draft_packinglist", JSON.stringify(draftObj));
      } else {
        localStorage.removeItem("texflow_draft_packinglist");
      }
    }
  }, [hasCheckedDraft, hasContent, packingType, clientId, sellerId, docDate, notes, formProviderId, articleGroups, editingPackingList, isDuplicate, guideNumber, dispatchAddress]);

  // Reset success save status when editing/duplicating changes or form fields are modified
  useEffect(() => {
    setIsSuccessfullySaved(false);
  }, [editingPackingList, isDuplicate]);

  // Native browser beforeunload warning for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedContent =
        clientId !== '' ||
        sellerId !== '' ||
        notes.trim() !== '' ||
        guideNumber.trim() !== '' ||
        dispatchAddress.trim() !== '' ||
        articleGroups.some(g => 
          g.articleId || 
          g.providerId || 
          g.lot || 
          g.partida || 
          g.tono || 
          (g.rolls && g.rolls.length > 0)
        );

      if (hasUnsavedContent && !isSuccessfullySaved) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [clientId, sellerId, notes, guideNumber, dispatchAddress, articleGroups, isSuccessfullySaved]);

  // Propagate formProviderId to all article groups and reset incompatible ones
  useEffect(() => {
    if (formProviderId && !editingPackingList) {
      setArticleGroups(prev => prev.map(g => {
        if (g.providerId !== formProviderId) {
          const matchingArticles = articles.filter(a => a.providerId === formProviderId);
          return {
            ...g,
            providerId: formProviderId,
            articleId: matchingArticles.length === 1 ? matchingArticles[0].id : '',
            lot: '',
            partida: '',
            tono: '',
            rolls: []
          };
        }
        return g;
      }));
    }
  }, [formProviderId, articles, editingPackingList]);

  // Prefill form for Editing / Duplicating
  useEffect(() => {
    if (editingPackingList) {
      const clientObj = clients.find(c => c.id === editingPackingList.clientId || c.name === editingPackingList.clientId);
      const sellerObj = sellers.find(s => s.id === editingPackingList.sellerId || s.name === editingPackingList.sellerId);

      setPackingType(editingPackingList.type as any);
      setClientId(clientObj ? clientObj.id : (editingPackingList.clientId || ''));
      setSellerId(sellerObj ? sellerObj.id : (editingPackingList.sellerId || ''));
      setGuideNumber(editingPackingList.guideNumber || '');
      setDispatchAddress(editingPackingList.dispatchAddress || '');
      
      // If duplicating, set current date. Otherwise, keep the original date.
      if (isDuplicate) {
        setDocDate(new Date().toISOString().split('T')[0]);
      } else {
        setDocDate(editingPackingList.date || new Date().toISOString().split('T')[0]);
      }
      
      setNotes(editingPackingList.notes || '');
      
      // Determine formProviderId from the first item if available, resolving from articles if missing
      const plItems = editingPackingList.items || [];
      const firstItem = plItems[0];
      const firstArticle = firstItem ? articles.find(a => a.id === firstItem.articleId || a.name?.trim().toLowerCase() === (firstItem.articleId || '').trim().toLowerCase()) : null;
      const firstProvider = firstItem ? providers.find(p => p.id === firstItem.providerId || p.name?.trim().toLowerCase() === (firstItem.providerId || '').trim().toLowerCase()) : null;
      const initialProviderId = firstProvider?.id || firstItem?.providerId || (firstArticle ? firstArticle.providerId : '') || (providers[0]?.id || '');
      setFormProviderId(initialProviderId);

      // Group items by articleId (or providerId + articleId)
      const groupsMap: Record<string, FormArticleGroup> = {};
      plItems.forEach((item, itemIdx) => {
        const articleObj = articles.find(a => a.id === item.articleId || a.name?.trim().toLowerCase() === (item.articleId || '').trim().toLowerCase());
        const resolvedArticleId = articleObj ? articleObj.id : (item.articleId || '');

        const providerObj = providers.find(p => p.id === item.providerId || p.name?.trim().toLowerCase() === (item.providerId || '').trim().toLowerCase()) || 
                            (articleObj ? providers.find(p => p.id === articleObj.providerId) : null);
        const resolvedProviderId = providerObj ? providerObj.id : (item.providerId || initialProviderId);

        const groupKey = resolvedArticleId ? `art-${resolvedArticleId}` : `group-${itemIdx}`;

        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            id: `group-prefill-${resolvedProviderId}-${resolvedArticleId || itemIdx}`,
            providerId: resolvedProviderId,
            articleId: resolvedArticleId,
            lot: item.lot || '',
            partida: item.partida || '',
            tono: item.tono || '',
            source: item.rollId ? 'inventory' : 'custom',
            rolls: [],
            hasProcessedExcel: false
          };
        }
        
        // Find max meters (current inventory stock + the meters allocated to this PL item if editing)
        const rollInInv = item.rollId ? inventory.find(inv => inv.id === item.rollId) : null;
        let maxMeters: number | undefined;
        if (item.rollId) {
          maxMeters = (rollInInv?.currentMeters || 0) + (isDuplicate ? 0 : item.meters);
        }

        groupsMap[groupKey].rolls.push({
          id: item.id || `roll-prefill-${itemIdx}-${groupsMap[groupKey].rolls.length}`,
          rollId: item.rollId,
          rollNumber: item.rollNumber || '',
          meters: item.meters || 0,
          maxMeters,
          lot: item.lot || '',
          partida: item.partida || '',
          tono: item.tono || '',
          width: item.width || '',
          weight: item.weight || ''
        });
      });

      let reconstructedGroups = Object.values(groupsMap).map(group => {
        const pConfig = providers.find(p => p.id === group.providerId) || null;
        const isExcelOnly = !!(pConfig && (pConfig.hasRollNo ?? true) && pConfig.hasWidth && pConfig.hasWeight);
        const hasRowData = group.rolls.some(r => 
          Boolean(
            (r.lot && r.lot.trim() !== '') ||
            (r.partida && r.partida.trim() !== '') ||
            (r.tono && r.tono.trim() !== '') ||
            (r.width && r.width.trim() !== '') ||
            (r.weight && r.weight.trim() !== '')
          )
        );

        return {
          ...group,
          hasProcessedExcel: isExcelOnly || hasRowData
        };
      });

      if (reconstructedGroups.length === 0) {
        reconstructedGroups = [
          {
            id: `group-${Date.now()}-${Math.random()}`,
            providerId: initialProviderId,
            articleId: '',
            lot: '',
            partida: '',
            tono: '',
            source: 'custom',
            rolls: [],
            hasProcessedExcel: false
          }
        ];
      }

      setArticleGroups(reconstructedGroups);
    } else {
      // Clear form when editingPackingList is null
      setPackingType('nuevo');
      setClientId('');
      setSellerId('');
      setDocDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setFormProviderId('');
      setGuideNumber('');
      setDispatchAddress('');
      setArticleGroups([
        {
          id: `group-${Date.now()}-${Math.random()}`,
          providerId: '',
          articleId: '',
          lot: '',
          partida: '',
          tono: '',
          source: 'custom',
          rolls: [],
          hasProcessedExcel: false
        }
      ]);
    }
  }, [editingPackingList, isDuplicate, packingLists, providers, inventory, articles, clients, sellers]);

  // Full inventory fetching for all available rolls beyond paginated slice
  const [fullInventoryDocs, setFullInventoryDocs] = useState<RollItem[] | null>(null);

  useEffect(() => {
    if (inventoryHasMore && fullInventoryDocs === null) {
      fetchAllInventoryDocs()
        .then(docs => setFullInventoryDocs(docs))
        .catch(err => console.warn("Could not fetch full inventory in PackingListForm:", err));
    }
  }, [inventoryHasMore, fullInventoryDocs]);

  const effectiveFullInventory = useMemo(() => {
    return fullInventoryDocs || inventory;
  }, [fullInventoryDocs, inventory]);

  // Filter available inventory rolls across full dataset
  const availableRolls = useMemo(() => {
    return effectiveFullInventory.filter(r => r.currentMeters > 0);
  }, [effectiveFullInventory]);

  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    if (newClientId) {
      const selectedClient = clients.find(c => c.id === newClientId);
      if (selectedClient && selectedClient.address) {
        setDispatchAddress(selectedClient.address);
      } else {
        setDispatchAddress('');
      }

      // Auto-assign Seller:
      // 1. Direct explicit assigned seller from client catalog
      let matchedSellerId = '';
      if (selectedClient?.defaultSellerId && sellers.some(s => s.id === selectedClient.defaultSellerId)) {
        matchedSellerId = selectedClient.defaultSellerId;
      } else {
        // 2. Derive from history in packing lists:
        const clientHistory = packingLists
          .filter(pl => (pl.clientId === newClientId || (selectedClient && pl.clientId === selectedClient.name)) && pl.sellerId)
          .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());

        if (clientHistory.length > 0) {
          const recentSellerId = clientHistory[0].sellerId;
          if (sellers.some(s => s.id === recentSellerId)) {
            matchedSellerId = recentSellerId;
          }
        }
      }

      if (matchedSellerId) {
        setSellerId(matchedSellerId);
        const sellerObj = sellers.find(s => s.id === matchedSellerId);
        if (sellerObj) {
          toast.info(`Vendedor asignado automáticamente: ${sellerObj.name}`);
        }
      }
    } else {
      setDispatchAddress('');
    }
  };

  // Save new client on the fly
  const handleAddNewClient = async (name: string, fields: Record<string, string>): Promise<string> => {
    try {
      const newClientData = {
        name,
        dni: fields.dni || '',
        email: fields.email || '',
        phone: fields.phone || '',
        fiscalAddress: fields.fiscalAddress || '',
        address: fields.address || '',
        defaultSellerId: fields.defaultSellerId || sellerId || '',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'clients'), newClientData);
      await onRefresh(); // Refresh data to update parent's clients list
      if (newClientData.address) {
        setDispatchAddress(newClientData.address);
      }
      return docRef.id;
    } catch (err) {
      console.error("Error creating client on the fly:", err);
      throw new Error("No se pudo registrar el cliente. Verifique su conexión.");
    }
  };

  // Save new seller on the fly
  const handleAddNewSeller = async (name: string, fields: Record<string, string>): Promise<string> => {
    try {
      const newSellerData = {
        name,
        email: fields.email || '',
        phone: fields.phone || '',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'sellers'), newSellerData);
      await onRefresh(); // Refresh data to update parent's sellers list
      return docRef.id;
    } catch (err) {
      console.error("Error creating seller on the fly:", err);
      throw new Error("No se pudo registrar el vendedor. Verifique su conexión.");
    }
  };

  // Save new provider on the fly
  const handleAddNewProvider = async (name: string, fields: Record<string, string>): Promise<string> => {
    try {
      const hasLot = fields.hasLot ? (fields.hasLot || '').trim().toLowerCase() !== 'no' : true;
      const hasPartida = fields.hasPartida ? (fields.hasPartida || '').trim().toLowerCase() !== 'no' : true;
      const hasTono = fields.hasTono ? (fields.hasTono || '').trim().toLowerCase() !== 'no' : true;
      
      const newProviderData = {
        name,
        hasLot,
        hasPartida,
        hasTono,
        hasRollNo: true,
        hasWidth: false,
        hasWeight: false,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'providers'), newProviderData);
      await onRefresh(); // Refresh data to update parent's providers list
      setFormProviderId(docRef.id);
      return docRef.id;
    } catch (err) {
      console.error("Error creating provider on the fly:", err);
      throw new Error("No se pudo registrar el proveedor. Verifique su conexión.");
    }
  };

  // Save new article on the fly
  const handleAddNewArticle = async (name: string, fields: Record<string, string>): Promise<string> => {
    try {
      if (!formProviderId) {
        throw new Error("Debe seleccionar un Proveedor primero antes de registrar un nuevo artículo.");
      }
      const newArticleData = {
        name,
        description: fields.description || '',
        unit: 'metros',
        providerId: formProviderId,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'articles'), newArticleData);
      await onRefresh(); // Refresh data to update parent's articles list
      return docRef.id;
    } catch (err: any) {
      console.error("Error creating article on the fly:", err);
      throw new Error(err.message || "No se pudo registrar el artículo. Verifique su conexión.");
    }
  };

  // Initial group setup (start with 1 empty article group when not editing)
  useEffect(() => {
    if (articleGroups.length === 0 && !editingPackingList) {
      const activeProvId = formProviderId || '';
      const matchingArticles = articles.filter(a => a.providerId === activeProvId);
      const defaultArticleId = matchingArticles.length === 1 ? matchingArticles[0].id : '';

      const newGroup: FormArticleGroup = {
        id: `group-${Date.now()}-${Math.random()}`,
        providerId: activeProvId,
        articleId: defaultArticleId,
        lot: '',
        partida: '',
        tono: '',
        source: 'custom',
        rolls: []
      };
      setArticleGroups([newGroup]);
    }
  }, []);

  const handleAddArticleGroup = () => {
    const activeProvId = formProviderId || '';
    const matchingArticles = articles.filter(a => a.providerId === activeProvId);
    const defaultArticleId = matchingArticles.length === 1 ? matchingArticles[0].id : '';

    const newGroup: FormArticleGroup = {
      id: `group-${Date.now()}-${Math.random()}`,
      providerId: activeProvId,
      articleId: defaultArticleId,
      lot: '',
      partida: '',
      tono: '',
      source: 'custom',
      rolls: []
    };
    setArticleGroups(prev => [...prev, newGroup]);
  };

  const handleRemoveArticleGroup = (groupId: string) => {
    if (articleGroups.length <= 1) {
      setError('Debe incluir al menos un artículo en el Packing List.');
      return;
    }
    setArticleGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const switchToCorteMode = () => {
    setPackingType('corte');
    setArticleGroups(prev => prev.map(g => ({
      ...g,
      source: 'custom',
      rolls: g.rolls.map((r, rIdx) => ({
        ...r,
        rollId: undefined,
        rollNumber: r.rollNumber.startsWith('ROLLO-') ? `CORTE-${rIdx + 1}` : r.rollNumber
      }))
    })));
    setError(null);
    toast.info('Se cambió el despacho a modo "P. List Corte". Todos tus artículos y metrajes se mantuvieron intactos.');
  };

  const handleRollKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, groupId: string, rollIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddRollToGroup(groupId);
      setTimeout(() => {
        const nextInput = document.getElementById(`meters-${groupId}-${rollIndex + 1}`) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }, 80);
    }
  };

  const handleAddRollToGroup = (groupId: string) => {
    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        // Suggest next roll or cut number
        const rollsCount = g.rolls.length;
        let nextRollNumber = packingType === 'nuevo' ? `ROLLO-${rollsCount + 1}` : `CORTE-${rollsCount + 1}`;
        
        const lastRollNum = g.rolls[rollsCount - 1]?.rollNumber || '';
        if (lastRollNum) {
          const match = lastRollNum.match(/^(.*?)(\d+)$/);
          if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10) + 1;
            nextRollNumber = `${prefix}${num}`;
          }
        }

        return {
          ...g,
          rolls: [
            ...g.rolls,
            {
              id: `roll-${Date.now()}-${Math.random()}`,
              rollNumber: nextRollNumber,
              meters: packingType === 'corte' ? '' : (packingType === 'nuevo' ? 50 : 0),
              lot: g.lot || '',
              partida: g.partida || '',
              tono: g.tono || '',
              width: '',
              weight: ''
            }
          ]
        };
      }
      return g;
    }));
  };

  const handleRemoveRollFromGroup = (groupId: string, rollId: string) => {
    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          rolls: g.rolls.filter(r => r.id !== rollId)
        };
      }
      return g;
    }));
  };

  const handleAddScannedRollToGroup = (groupId: string, scan: {
    rollNumber: string;
    meters?: number;
    lot?: string;
    partida?: string;
    tono?: string;
    width?: string;
    weight?: string;
    rollId?: string;
    maxMeters?: number;
  }) => {
    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        // Custom manual roll scan entry
        return {
          ...g,
          rolls: [
            ...g.rolls,
            {
              id: `roll-${Date.now()}-${Math.random()}`,
              rollNumber: scan.rollNumber,
              rollId: scan.rollId,
              meters: scan.meters !== undefined ? scan.meters : (packingType === 'corte' ? '' : (packingType === 'nuevo' ? 50 : 0)),
              maxMeters: scan.maxMeters,
              lot: scan.lot || g.lot || '',
              partida: scan.partida || g.partida || '',
              tono: scan.tono || g.tono || '',
              width: scan.width || '',
              weight: scan.weight || ''
            }
          ]
        };
      }
      return g;
    }));
  };

  const handleProcessUnifiedInput = (groupId: string, textToProcess?: string, manualMapping?: { [colIdx: number]: string }) => {
    const text = (textToProcess !== undefined ? textToProcess : '').trim();
    if (!text) return;

    // Check if the provider has specific fields configured
    const group = articleGroups.find(g => g.id === groupId);
    if (!group) return;
    const pConfig = providers.find(p => p.id === group.providerId);

    const resolution = resolveColumnsForText(text, pConfig, manualMapping);
    const {
      metersColIdx,
      rollColIdx,
      lotColIdx,
      partidaColIdx,
      tonoColIdx,
      widthColIdx,
      weightColIdx,
      startLineIndex,
      lines,
      splitIntoColumns
    } = resolution;

    const parseMetersVal = (val: string): number | null => {
      if (!val) return null;
      let clean = val.trim();
      // Remove trailing units like m, mts, mt, mtrs, yds, yd, etc.
      clean = clean.replace(/m|mts|mt|mtrs|mtr|yds|yd|yardas|yarda/i, '').trim();
      if (/[a-zA-Z]/g.test(clean)) {
        return null;
      }
      clean = clean.replace(',', '.');
      const n = parseFloat(clean);
      return isNaN(n) ? null : n;
    };

    interface ParsedRow {
      rollNumber?: string;
      meters: number;
      lot?: string;
      partida?: string;
      tono?: string;
      width?: string;
      weight?: string;
    }

    const parsedRows: ParsedRow[] = [];

    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = splitIntoColumns(line);
      if (cols.length === 0) continue;

      let rowMeters: number | null = null;
      let rowRollNum = '';
      let rowLot = '';
      let rowPartida = '';
      let rowTono = '';
      let rowWidth = '';
      let rowWeight = '';

      if (metersColIdx !== -1 && cols[metersColIdx] !== undefined) {
        rowMeters = parseSanitizedNumeric(cols[metersColIdx]);
        if (rollColIdx !== -1 && cols[rollColIdx]) rowRollNum = cols[rollColIdx].trim();
        if (lotColIdx !== -1 && cols[lotColIdx]) rowLot = cols[lotColIdx].trim();
        if (partidaColIdx !== -1 && cols[partidaColIdx]) rowPartida = cols[partidaColIdx].trim();
        if (tonoColIdx !== -1 && cols[tonoColIdx]) rowTono = cols[tonoColIdx].trim();
        if (widthColIdx !== -1 && cols[widthColIdx]) {
          const parsedW = parseSanitizedNumeric(cols[widthColIdx]);
          rowWidth = parsedW !== null ? String(parsedW) : cols[widthColIdx].replace(/m|mts|mt|cm/i, '').trim();
        }
        if (weightColIdx !== -1 && cols[weightColIdx]) {
          const parsedKg = parseSanitizedNumeric(cols[weightColIdx]);
          rowWeight = parsedKg !== null ? String(parsedKg) : cols[weightColIdx].replace(/kg|kgs|kilos|kilo/i, '').trim();
        }
      }

      if (rowMeters !== null && rowMeters > 0) {
        parsedRows.push({
          rollNumber: rowRollNum || undefined,
          meters: Number(rowMeters.toFixed(2)),
          lot: rowLot || undefined,
          partida: rowPartida || undefined,
          tono: rowTono || undefined,
          width: rowWidth || undefined,
          weight: rowWeight || undefined
        });
      }
    }

    if (parsedRows.length === 0) {
      setError("No se encontraron metrajes válidos. Ingrese un número o pegue una tabla desde Excel.");
      return;
    }

    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        let rollsCount = g.rolls.length;
        const newRolls = [...g.rolls];
        
        let lotUpdated = g.lot;
        let partidaUpdated = g.partida;
        let tonoUpdated = g.tono;

        const isExcelOrBulk = lines.length > 1 || text.includes('\t') || text.includes(';') || /\s{2,}/.test(text);

        parsedRows.forEach(row => {
          if (row.lot && pConfig?.hasLot) lotUpdated = row.lot;
          if (row.partida && pConfig?.hasPartida) partidaUpdated = row.partida;
          if (row.tono && pConfig?.hasTono) tonoUpdated = row.tono;

          let finalRollNum = row.rollNumber;
          if (!finalRollNum) {
            finalRollNum = packingType === 'corte' ? `CORTE-${rollsCount + 1}` : `ROLLO-${rollsCount + 1}`;
            const lastRollNum = newRolls[newRolls.length - 1]?.rollNumber || '';
            if (lastRollNum) {
              const match = lastRollNum.match(/^(.*?)(\d+)$/);
              if (match) {
                const prefix = match[1];
                const num = parseInt(match[2], 10) + 1;
                finalRollNum = `${prefix}${num}`;
              }
            }
          }

          newRolls.push({
            id: `roll-${Date.now()}-${Math.random()}-${rollsCount}`,
            rollNumber: finalRollNum,
            meters: row.meters,
            lot: row.lot || g.lot || '',
            partida: row.partida || g.partida || '',
            tono: row.tono || g.tono || '',
            width: row.width || '',
            weight: row.weight || ''
          });
          rollsCount++;
        });

        return {
          ...g,
          lot: isExcelOrBulk ? '' : g.lot,
          partida: isExcelOrBulk ? '' : g.partida,
          tono: isExcelOrBulk ? '' : g.tono,
          hasProcessedExcel: isExcelOrBulk ? true : g.hasProcessedExcel,
          rolls: newRolls
        };
      }
      return g;
    }));
  };

  const handleGroupFieldChange = (groupId: string, field: keyof FormArticleGroup, value: any) => {
    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        if (field === 'providerId') {
          const matchingArticles = articles.filter(a => a.providerId === value);
          const nextArticleId = matchingArticles[0]?.id || '';
          return {
            ...g,
            providerId: value,
            articleId: nextArticleId,
            lot: '',
            partida: '',
            tono: '',
            hasProcessedExcel: false,
            rolls: []
          };
        }
        if (field === 'articleId') {
          return {
            ...g,
            articleId: value,
            hasProcessedExcel: false,
            rolls: []
          };
        }
        if (field === 'source') {
          // Reset roll configuration with empty rolls array
          return {
            ...g,
            source: value,
            hasProcessedExcel: false,
            rolls: []
          };
        }
        
        // Master inputs lot, partida, and tono are updated here and will only be applied to newly created rolls.
        return { ...g, [field]: value };
      }
      return g;
    }));
  };

  const handleRollFieldChange = (groupId: string, rollId: string, field: keyof FormRollEntry, value: any) => {
    setArticleGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        return {
          ...g,
          rolls: g.rolls.map(r => {
            if (r.id === rollId) {
              if (field === 'rollId') {
                const warehouseRoll = inventory.find(wr => wr.id === value);
                if (warehouseRoll) {
                  return {
                    ...r,
                    rollId: warehouseRoll.id,
                    rollNumber: warehouseRoll.rollNumber,
                    meters: warehouseRoll.currentMeters,
                    maxMeters: warehouseRoll.currentMeters
                  };
                }
              }
              return { ...r, [field]: value };
            }
            return r;
          })
        };
      }
      return g;
    }));
  };

  const getProviderConfig = (providerId: string) => {
    return providers.find(p => p.id === providerId) || null;
  };

  // Submit and Save
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    // Header validations
    if (!clientId) {
      const diag = {
        title: 'Cliente Requerido',
        message: 'Por favor seleccione el Cliente antes de continuar.',
        rootCause: 'El campo de Cliente no tiene ningún cliente asignado.',
        solution: 'Busque y seleccione el cliente en el buscador del formulario o regístrelo en Catálogos.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }
    if (!sellerId) {
      const diag = {
        title: 'Vendedor Requerido',
        message: 'Por favor seleccione el Vendedor responsable de la orden.',
        rootCause: 'El campo de Vendedor se encuentra vacío.',
        solution: 'Seleccione un vendedor de la lista desplegable.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }
    if (!formProviderId) {
      const diag = {
        title: 'Proveedor Requerido',
        message: 'Por favor seleccione el Proveedor para este despacho.',
        rootCause: 'No se ha indicado el proveedor o tela matriz.',
        solution: 'Seleccione el proveedor correspondiente en el selector superior.'
      };
      setError(diag);
      toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
      return;
    }

    // Article groups validations & missing fields collection
    const missingFieldsSet = new Set<string>();

    for (let gIdx = 0; gIdx < articleGroups.length; gIdx++) {
      const g = articleGroups[gIdx];
      if (!g.articleId) {
        const diag = {
          title: `Artículo #${gIdx + 1} sin selección`,
          message: `Debe seleccionar un Artículo en la Sección #${gIdx + 1}.`,
          rootCause: 'La sección de producto no tiene artículo asociado.',
          solution: 'Seleccione una tela o artículo del catálogo o elimine la sección vacía.'
        };
        setError(diag);
        toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
        return;
      }

      if (g.rolls.length === 0) {
        const diag = {
          title: `Sin rollos en Artículo #${gIdx + 1}`,
          message: `Artículo #${gIdx + 1}: Debe ingresar al menos un metraje/rollo usando el casillero de ingreso rápido.`,
          rootCause: 'No se han agregado cantidades de metros a este artículo.',
          solution: 'Escriba o pegue los metrajes en la caja de ingreso rápido y presione Enter o Procesar.'
        };
        setError(diag);
        toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
        return;
      }

      const config = getProviderConfig(g.providerId);
      
      // Check dynamic attributes required by provider (lot, partida, tono, width, weight)
      if ((packingType === 'nuevo' || packingType === 'rollo') && config) {
        if (config.hasLot && g.rolls.some(r => !r.lot?.trim() && !g.lot?.trim())) {
          missingFieldsSet.add('lot');
        }
        if (config.hasPartida && g.rolls.some(r => !r.partida?.trim() && !g.partida?.trim())) {
          missingFieldsSet.add('partida');
        }
        if (config.hasTono && g.rolls.some(r => !r.tono?.trim() && !g.tono?.trim())) {
          missingFieldsSet.add('tono');
        }
        if (config.hasWidth && g.rolls.some(r => !r.width?.trim())) {
          missingFieldsSet.add('width');
        }
        if (config.hasWeight && g.rolls.some(r => !r.weight?.trim())) {
          missingFieldsSet.add('weight');
        }
      }

      // Validate rolls inside this article group
      for (let rIdx = 0; rIdx < g.rolls.length; rIdx++) {
        const r = g.rolls[rIdx];
        if ((packingType === 'nuevo' || packingType === 'rollo') && g.source === 'inventory' && !r.rollId) {
          const diag = {
            title: 'Rollo sin asignar',
            message: `Artículo #${gIdx + 1}, Cantidad #${rIdx + 1}: Debe seleccionar un rollo de stock asignado.`,
            rootCause: 'La fila proviene de inventario pero no tiene un ID de rollo físico vinculado.',
            solution: 'Seleccione un rollo disponible en la lista o cambie a modo directo si no requiere control de inventario.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
        if ((packingType === 'nuevo' || packingType === 'rollo') && g.source === 'custom' && !r.rollNumber.trim() && (!config || (config.hasRollNo ?? true))) {
          const diag = {
            title: 'Número de Rollo Requerido',
            message: `Artículo #${gIdx + 1}, Cantidad #${rIdx + 1}: El identificador o número de rollo es obligatorio.`,
            rootCause: 'El identificador del rollo está en blanco.',
            solution: 'Escriba un número de rollo o active la autogeneración.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
        const numMeters = Number(r.meters);
        if (isNaN(numMeters) || numMeters <= 0) {
          const diag = {
            title: 'Metraje Inválido',
            message: `Artículo #${gIdx + 1}, Cantidad #${rIdx + 1}: Ingrese un metraje numérico válido mayor a 0.`,
            rootCause: `El valor numérico de metros ingresado es "${r.meters}".`,
            solution: 'Ingrese una cantidad mayor a 0 metros o elimine la fila.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
        if (packingType === 'corte' && numMeters < 0.10) {
          const diag = {
            title: 'Metraje de Corte Inválido',
            message: `Artículo #${gIdx + 1}, Corte #${rIdx + 1}: El metraje para cortes debe ser de mínimo 0.10m (10 cm).`,
            rootCause: `El valor numérico ingresado (${numMeters}m) es menor al mínimo permitido para cortes (0.10m).`,
            solution: 'Ingrese una cantidad igual o mayor a 0.10 metros para el corte o elimine la fila.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
        if (packingType !== 'corte' && numMeters < 10.00) {
          const diag = {
            title: 'Metraje no permitido en Rollos',
            message: `Artículo #${gIdx + 1}, Rollo #${rIdx + 1}: El metraje ingresado (${numMeters}m) no está permitido en rollos. En la modalidad de rollos nuevos o antiguos el metraje debe ser de mínimo 10.00m. Si se trata de un corte o retazo, debes usar la modalidad de CORTES.`,
            rootCause: `En la modalidad "${packingType.toUpperCase()}", los rollos no pueden ser menores a 10.00 metros.`,
            solution: 'Haz clic en "Cambiar a Modo CORTES" para convertir este despacho a cortes manteniendo todos tus datos, o ajusta el metraje a ≥ 10.00m.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
        if (r.maxMeters && numMeters > r.maxMeters) {
          const diag = {
            title: 'Metraje Supera Stock Disponible',
            message: `Artículo #${gIdx + 1}, Cantidad #${rIdx + 1}: Los metros ingresados (${numMeters}m) superan el stock de almacén disponible para este rollo (${r.maxMeters}m).`,
            rootCause: `Stock máximo disponible: ${r.maxMeters}m, solicitado: ${numMeters}m.`,
            solution: `Ajuste la cantidad a ${r.maxMeters}m o elija otro rollo con suficiente saldo.`
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          return;
        }
      }
    }

    // Execute atomic save logic with omitted fields recorded
    const executeSave = async (omittedList: string[]) => {

    // Validate duplicate rollIds
    const seenRollIds: { [rollId: string]: string } = {};
    for (const g of articleGroups) {
      for (const r of g.rolls) {
        if (r.rollId) {
          if (seenRollIds[r.rollId]) {
            const diag = {
              title: 'Rollo Repetido en el Despacho',
              message: `El rollo '${r.rollNumber}' está siendo usado más de una vez en este despacho.`,
              rootCause: 'El mismo rollo físico de inventario fue seleccionado en múltiples filas.',
              solution: 'Combina las cantidades en una sola fila o selecciona rollos diferentes.'
            };
            setError(diag);
            toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
            return;
          }
          seenRollIds[r.rollId] = r.rollNumber;
        }
      }
    }

    // Deep check across entire inventory for exhausted / already used rolls
    for (let gIdx = 0; gIdx < articleGroups.length; gIdx++) {
      const g = articleGroups[gIdx];
      for (let rIdx = 0; rIdx < g.rolls.length; rIdx++) {
        const r = g.rolls[rIdx];
        if (r.rollNumber && r.rollNumber.trim()) {
          let matchedRoll = effectiveFullInventory.find(
            invRoll => invRoll.articleId === g.articleId &&
                       invRoll.rollNumber.trim().toLowerCase() === r.rollNumber.trim().toLowerCase()
          );

          if (!matchedRoll) {
            try {
              const dbRoll = await findRollInInventory(r.rollNumber.trim(), g.articleId || undefined);
              if (dbRoll) {
                matchedRoll = dbRoll;
              }
            } catch (err) {
              console.warn("Error looking up roll in DB:", err);
            }
          }

          if (matchedRoll && matchedRoll.currentMeters === 0 && (!editingPackingList || !editingPackingList.items.some(item => item.rollId === matchedRoll!.id))) {
            let usedPL = packingLists.find(pl => pl.items.some(item => item.rollId === matchedRoll!.id));
            if (!usedPL) {
              try {
                const allPLs = await fetchAllPackingLists();
                usedPL = allPLs.find(pl => pl.items.some(item => item.rollId === matchedRoll!.id));
              } catch (err) {
                console.warn("Error fetching all packing lists for roll check:", err);
              }
            }
            const plNo = usedPL ? usedPL.packingListNo : 'desconocido';
            
            const confirmed = window.confirm(
              `ADVERTENCIA: El rollo "${r.rollNumber}" ya figura como AGOTADO (0 metros) en el inventario. Se utilizó previamente en el Packing List N° ${plNo}.\n\n¿Desea continuar de todas formas con este despacho?`
            );
            if (!confirmed) {
              const diag = {
                title: 'Rollo Ya Agotado en Almacén',
                message: `El rollo "${r.rollNumber}" ya fue utilizado y agotado en el Packing List N° ${plNo}.`,
                rootCause: 'El identificador de rollo ingresado corresponde a un rollo con stock 0 metros.',
                solution: 'Verifique si el número es correcto o elija otro rollo disponible en almacén.'
              };
              setError(diag);
              toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
              return;
            }
          }
        }
      }
    }

    setLoading(true);

    try {
      // Build flattened items array for database storage
      const finalItems: PackingListItem[] = [];
      articleGroups.forEach(g => {
        g.rolls.forEach(r => {
          const item: PackingListItem = {
            id: `pli-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
            rollNumber: r.rollNumber || `ROLLO-DIRECT-${Math.floor(1000 + Math.random() * 9000)}`,
            articleId: g.articleId || '',
            providerId: g.providerId || '',
            meters: Number(r.meters) || 0,
            lot: r.lot || g.lot || '',
            partida: r.partida || g.partida || '',
            tono: r.tono || g.tono || '',
            width: r.width || '',
            weight: r.weight || ''
          };
          if (r.rollId) {
            item.rollId = r.rollId;
          }
          finalItems.push(item);
        });
      });

      const totalMetersValue = finalItems.reduce((acc, item) => acc + Number(item.meters || 0), 0);
      const totalRollsValue = finalItems.length;

      if (finalItems.length === 0 || totalMetersValue <= 0) {
        setError("Debe agregar al menos un rollo o corte con metraje antes de guardar el despacho.");
        setLoading(false);
        return;
      }

      const clientObj = clients.find(c => c.id === clientId);

      if (editingPackingList && !isDuplicate) {
        // --- 1. MODIFICAR/EDITAR PACKING LIST EXISTENTE (TRANSACCIÓN ATÓMICA) ---
        const updatedPL: PackingList = {
          ...editingPackingList,
          packingListNo: editingPackingList.packingListNo, // Mantiene intacto su número original
          type: packingType,
          clientId,
          sellerId,
          date: docDate,
          items: finalItems,
          totalMeters: totalMetersValue,
          totalRollsOrCuts: totalRollsValue,
          notes: notes.trim(),
          guideNumber: guideNumber.trim(),
          dispatchAddress: dispatchAddress.trim(),
          omittedFields: omittedList,
          signedBy: {
            ...editingPackingList.signedBy,
            date: docDate
          }
        };

        await runTransaction(db, async (transaction) => {
          // A. Collect unique roll IDs involved in old and new items
          const allRollIds = Array.from(new Set([
            ...editingPackingList.items.map(i => i.rollId).filter(Boolean),
            ...finalItems.map(i => i.rollId).filter(Boolean)
          ])) as string[];

          // B. READ PHASE (Firestore requirement: all reads before writes)
          const rollSnaps: Record<string, any> = {};
          for (const rollId of allRollIds) {
            const rollRef = doc(db, 'inventory', rollId);
            const snap = await transaction.get(rollRef);
            if (snap.exists()) {
              rollSnaps[rollId] = snap.data();
            } else {
              const localRoll = inventory.find(r => r.id === rollId);
              if (localRoll) rollSnaps[rollId] = localRoll;
            }
          }

          // C. WRITE PHASE: Update packing list doc
          const plRef = doc(db, 'packinglists', editingPackingList.id);
          transaction.update(plRef, updatedPL);

          // D. Calculate new currentMeters for each affected roll
          for (const rollId of allRollIds) {
            const baseData = rollSnaps[rollId];
            if (!baseData) continue;

            // Revert old items for this roll
            const oldMeters = editingPackingList.items
              .filter(oi => oi.rollId === rollId)
              .reduce((sum, item) => sum + item.meters, 0);

            // Subtract new items for this roll
            const newMeters = finalItems
              .filter(ni => ni.rollId === rollId)
              .reduce((sum, item) => sum + item.meters, 0);

            const initialMeters = Number(baseData.initialMeters || baseData.currentMeters || 0);
            const currentMeters = Number(baseData.currentMeters || 0);
            const nextMeters = Math.max(0, currentMeters + oldMeters - newMeters);
            const status = nextMeters === 0 ? 'sold' : (nextMeters >= initialMeters ? 'available' : 'partially_sold');

            const rollRef = doc(db, 'inventory', rollId);
            transaction.update(rollRef, {
              currentMeters: nextMeters,
              status,
              updatedAt: new Date().toISOString()
            });
          }
        });

        await onRefresh();
        setIsSuccessfullySaved(true);
        setSuccess(`¡Packing List ${updatedPL.packingListNo} modificado correctamente!`);
        localStorage.removeItem("texflow_draft_packinglist");
        
        // Cargamos vista de impresión/PDF inmediatamente
        onPackingListCreated(updatedPL);

      } else {
        // --- 2. REGISTRAR NUEVO PACKING LIST O DUPLICADO (TRANSACCIÓN ATÓMICA CON CONTADOR) ---
        let createdPL: PackingList | null = null;

        // Calcular el número más alto existente para asegurar continuidad si el contador aún no se ha inicializado
        let maxExistingNum = 0;
        packingLists.forEach(pl => {
          const match = (pl.packingListNo || '').match(/^PL-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxExistingNum) maxExistingNum = num;
          } else {
            const digits = (pl.packingListNo || '').match(/\d+/);
            if (digits) {
              const num = parseInt(digits[0], 10);
              if (!isNaN(num) && num > maxExistingNum) maxExistingNum = num;
            }
          }
        });

        await runTransaction(db, async (transaction) => {
          // A. READ PHASE (Firestore requirement: all reads before writes)
          // 1. Leer el contador atómico en Firestore
          const counterRef = doc(db, 'counters', 'packingListNo');
          const counterSnap = await transaction.get(counterRef);

          let nextValue = 1;
          if (counterSnap.exists()) {
            const counterData = counterSnap.data();
            const currentVal = Number(counterData?.currentValue) || 0;
            // Asegurar que siempre sea al menos mayor que el número más alto existente
            const baseVal = Math.max(currentVal, maxExistingNum);
            nextValue = baseVal + 1;
          } else {
            nextValue = maxExistingNum + 1;
          }

          const assignedPackingListNo = `PL-${String(nextValue).padStart(4, '0')}`;

          // 2. Leer los rollos de inventario afectados
          const rollIds = Array.from(new Set(finalItems.map(i => i.rollId).filter(Boolean))) as string[];
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

          // B. WRITE PHASE
          // 1. Actualizar el documento contador en Firestore
          transaction.set(counterRef, {
            currentValue: nextValue,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          // 2. Crear el nuevo documento Packing List con el correlativo asignado
          const newPL: PackingList = {
            id: `pl-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
            packingListNo: assignedPackingListNo,
            type: packingType,
            clientId,
            sellerId,
            date: docDate,
            items: finalItems,
            totalMeters: totalMetersValue,
            totalRollsOrCuts: totalRollsValue,
            notes: notes.trim(),
            guideNumber: guideNumber.trim(),
            dispatchAddress: dispatchAddress.trim(),
            omittedFields: omittedList,
            importantNotice: "Revisar el rollo antes de cortar y conservar la etiqueta.",
            signedBy: {
              name: "",
              dni: "",
              date: docDate,
              signaturePresent: true
            },
            createdAt: new Date().toISOString(),
            appVersion: '2.6r'
          };

          const plRef = doc(db, 'packinglists', newPL.id);
          transaction.set(plRef, newPL);
          createdPL = newPL;

          // 3. Descontar stock para cada rollo utilizado
          for (const rollId of rollIds) {
            const baseData = rollSnaps[rollId];
            if (!baseData) continue;

            const usedMeters = finalItems
              .filter(i => i.rollId === rollId)
              .reduce((sum, item) => sum + item.meters, 0);

            const initialMeters = Number(baseData.initialMeters || baseData.currentMeters || 0);
            const currentMeters = Number(baseData.currentMeters || 0);
            const nextMeters = Math.max(0, currentMeters - usedMeters);
            const status = nextMeters === 0 ? 'sold' : (nextMeters >= initialMeters ? 'available' : 'partially_sold');

            const rollRef = doc(db, 'inventory', rollId);
            transaction.update(rollRef, {
              currentMeters: nextMeters,
              status,
              updatedAt: new Date().toISOString()
            });
          }
        });

        await onRefresh();
        setIsSuccessfullySaved(true);
        if (createdPL) {
          const msg = `¡Packing List ${(createdPL as PackingList).packingListNo} registrado correctamente!`;
          setSuccess(msg);
          toast.success(msg);
          localStorage.removeItem("texflow_draft_packinglist");
          
          // Cargamos vista de impresión/PDF inmediatamente
          onPackingListCreated(createdPL);
        }
      }

      // Resetear estado del formulario
      resetFormState();
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'guardar el Packing List', entity: 'packing_lists' });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'guardar el Packing List', entity: 'packing_lists' });
    } finally {
      setLoading(false);
    }
  };

  // Prompt user confirmation modal if mandatory provider fields are missing
  if (missingFieldsSet.size > 0) {
    setMissingFieldsConfirm({
      fields: Array.from(missingFieldsSet),
      onConfirm: () => {
        setMissingFieldsConfirm(null);
        executeSave(Array.from(missingFieldsSet));
      }
    });
    return;
  }

  executeSave([]);
};

  // Global Keyboard Shortcuts (Ctrl+Enter to Save, Escape to close draft prompt modal)
  useEffect(() => {
    const handleFormKeyDown = (e: KeyboardEvent) => {
      const isEnter = e.key === 'Enter';
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isEnter && isCtrlOrMeta) {
        e.preventDefault();
        handleSubmit();
      }

      if (e.key === 'Escape') {
        if (showRecoveryPrompt) {
          e.preventDefault();
          handleDiscardDraft();
        }
      }
    };

    window.addEventListener('keydown', handleFormKeyDown);
    return () => window.removeEventListener('keydown', handleFormKeyDown);
  }, [handleSubmit, showRecoveryPrompt]);

  return (
    <div className="ticket-perforated p-3.5 sm:p-6 shadow-xs">
      {showRecoveryPrompt && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded-lg w-full max-w-md shadow-xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-950/40 p-5 flex items-center gap-3">
              <div className="bg-amber-500 text-white p-2 rounded">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">Borrador Detectado</h4>
                <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-0.5">DESPACHO SIN GUARDAR</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-xs font-medium leading-relaxed text-app-text/80">
                Se encontró un despacho sin guardar de una sesión anterior. ¿Deseas recuperar este borrador para continuar trabajando en él?
              </p>
              
              <div className="bg-app-bg border border-app-border rounded p-3 text-[10px] space-y-1 text-app-text/70">
                <div>• <strong>Cliente:</strong> {clients.find(c => c.id === draftData?.clientId)?.name || 'No especificado'}</div>
                <div>• <strong>Artículos:</strong> {draftData?.articleGroups?.length || 0} sección(es) de tela</div>
                <div>• <strong>Rollos/Cortes:</strong> {draftData?.articleGroups?.reduce((acc: number, g: any) => acc + (g.rolls?.length || 0), 0) || 0} unidades</div>
                {draftData?.notes && (
                  <div className="truncate">• <strong>Notas:</strong> {draftData.notes}</div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
              <button
                onClick={handleDiscardDraft}
                className="px-3 py-1.5 hover:bg-red-50 hover:text-red-600 border border-app-border rounded text-xs font-bold transition cursor-pointer"
              >
                Descartar
              </button>
              <button
                onClick={handleRecoverDraft}
                className="px-3 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                Recuperar Despacho
              </button>
            </div>

          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-app-border pb-4 mb-4 sm:mb-6">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-app-text flex items-center gap-2">
            {editingPackingList && !isDuplicate ? (
              <>
                <ShoppingBag className="text-app-primary shrink-0" size={19} />
                <span>Modificar Packing List <span className="font-mono text-app-primary">{editingPackingList.packingListNo}</span></span>
              </>
            ) : isDuplicate ? (
              <>
                <ShoppingBag className="text-app-text/90 shrink-0" size={19} />
                <span>Duplicar Packing List <span className="font-mono text-app-text/90">{editingPackingList?.packingListNo}</span></span>
              </>
            ) : packingType === 'corte' ? (
              <>
                <Scissors className="text-app-secondary shrink-0" size={19} />
                <span>Packing List de Cortes</span>
              </>
            ) : packingType === 'antiguo' ? (
              <>
                <Archive className="text-app-secondary shrink-0" size={19} />
                <span>Packing List Histórico</span>
              </>
            ) : (
              <>
                <ShoppingBag className="text-app-secondary shrink-0" size={19} />
                <span>Nuevo Packing List</span>
              </>
            )}
          </h2>
          <p className="text-xs text-app-text/60 mt-1 leading-snug">
            {editingPackingList && !isDuplicate 
              ? 'Modifique metrajes, cliente u operarios. El inventario se recalculará automáticamente.' 
              : isDuplicate 
                ? 'Cree un nuevo packing list a partir del original.'
                : packingType === 'corte'
                  ? 'Registre cortes fraccionados, retazos y muestras textiles (mínimo 0.10 m).'
                  : packingType === 'antiguo'
                    ? 'Digitalice despachos anteriores o notas manuales sin requerir existencias previas.'
                    : 'Registre despachos ingresando múltiples cantidades de metraje con control de stock.'}
          </p>
        </div>

        {/* Segmented Selector for Nuevo, Antiguo, or Corte */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Subtle Button for Technical Resting Guide */}
          <button
            type="button"
            onClick={() => setShowRestingGuide(true)}
            className="p-1.5 px-2 text-app-text/40 hover:text-app-text/80 hover:bg-app-bg border border-dashed border-app-border/60 hover:border-app-border rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs shrink-0"
            title="Guía técnica: Tiempo de reposo textil por tipo de tela (JUDITEX)"
            id="btn-resting-guide-packing"
          >
            <Clock size={13} className="text-app-text/50" />
            <span className="text-[11px] hidden sm:inline font-mono">Guía de Reposo</span>
          </button>

          <div className="grid grid-cols-3 sm:flex bg-app-bg p-1 rounded-lg border border-app-border gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setPackingType('nuevo');
                setArticleGroups(prev => prev.map(g => ({
                  ...g,
                  rolls: g.rolls.map((r, rIdx) => ({
                    ...r,
                    rollNumber: r.rollNumber.startsWith('CORTE-') ? `ROLLO-${rIdx + 1}` : r.rollNumber
                  }))
                })));
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer min-h-[36px] sm:min-h-0 text-center flex items-center justify-center gap-1.5 ${
                packingType === 'nuevo'
                  ? 'bg-app-surface text-app-text shadow-xs border border-app-border font-bold'
                  : 'text-app-text/60 hover:text-app-text hover:bg-app-surface/50'
              }`}
              id="toggle-type-nuevo"
            >
              <span>P. List Nuevo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPackingType('antiguo');
                setArticleGroups(prev => prev.map(g => ({
                  ...g,
                  source: 'custom',
                  rolls: g.rolls.map((r, rIdx) => ({
                    ...r,
                    rollId: undefined,
                    rollNumber: r.rollNumber.startsWith('ROLLO-') ? `CORTE-${rIdx + 1}` : r.rollNumber
                  }))
                })));
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer min-h-[36px] sm:min-h-0 text-center flex items-center justify-center gap-1.5 ${
                packingType === 'antiguo'
                  ? 'bg-app-surface text-app-text shadow-xs border border-app-border font-bold'
                  : 'text-app-text/60 hover:text-app-text hover:bg-app-surface/50'
              }`}
              id="toggle-type-antiguo"
            >
              <span>P. List Antiguo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPackingType('corte');
                setArticleGroups(prev => prev.map(g => ({
                  ...g,
                  source: 'custom',
                  rolls: g.rolls.map((r, rIdx) => ({
                    ...r,
                    rollId: undefined,
                    rollNumber: r.rollNumber.startsWith('ROLLO-') ? `CORTE-${rIdx + 1}` : r.rollNumber
                  }))
                })));
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer min-h-[36px] sm:min-h-0 text-center flex items-center justify-center gap-1.5 ${
                packingType === 'corte'
                  ? 'bg-app-surface text-app-text shadow-xs border border-app-border font-bold'
                  : 'text-app-text/60 hover:text-app-text hover:bg-app-surface/50'
              }`}
              id="toggle-type-corte"
            >
              <span>P. List Corte</span>
            </button>
          </div>
        </div>
      </div>

      {editingPackingList && (
        <AlertBanner
          type="info"
          message={
            <div className="flex items-center justify-between gap-3 w-full flex-wrap sm:flex-nowrap">
              <span className="font-medium text-xs">
                {isDuplicate ? (
                  <>
                    Duplicando Packing List N° <strong className="font-mono">{editingPackingList.packingListNo}</strong>
                  </>
                ) : (
                  <>
                    Editando Packing List N° <strong className="font-mono">{editingPackingList.packingListNo}</strong>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-2.5 py-1 bg-app-info/20 hover:bg-app-info/30 text-app-info border border-app-info/40 rounded text-xs font-bold transition cursor-pointer shrink-0 ml-auto"
                id="btn-cancel-editing-mode"
              >
                Cancelar
              </button>
            </div>
          }
          className="mb-4"
          id="alert-pl-editing-mode"
        />
      )}

      {error && (
        <AlertBanner
          type="error"
          message={typeof error === 'string' ? error : error.message}
          title={typeof error === 'object' ? error.title : undefined}
          rootCause={typeof error === 'object' ? error.rootCause : undefined}
          solution={typeof error === 'object' ? error.solution : undefined}
          technicalDetails={typeof error === 'object' ? error.technicalDetails : undefined}
          onClose={() => setError(null)}
          className="mb-4"
          id="alert-pl-error"
        />
      )}

      {error && typeof error === 'object' && error.title === 'Metraje no permitido en Rollos' && (
        <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div className="text-xs text-amber-900 dark:text-amber-100">
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️ ¿Deseas convertir este despacho a Packing List de Cortes?</span>
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
              Al cambiar a modo Cortes se mantendrán todos los artículos y cantidades ya ingresados sin perder datos.
            </p>
          </div>
          <button
            type="button"
            onClick={switchToCorteMode}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
            id="btn-convert-to-corte-action"
          >
            <span>Cambiar a Modo CORTES</span>
            <span>⚡</span>
          </button>
        </div>
      )}

      {success && (
        <AlertBanner
          type="success"
          message={success}
          onClose={() => setSuccess(null)}
          className="mb-4"
          id="alert-pl-success"
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* SECCIÓN 1: DATOS DEL DESPACHO */}
        <div className="p-3.5 sm:p-5 border border-app-border rounded-xl bg-app-bg/30 space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-app-border">
            <div className="p-1.5 rounded-md bg-app-primary/10 text-app-primary">
              <FileText size={18} />
            </div>
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              1. Datos del Despacho
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-bold text-app-text/80 mb-1">Fecha de Despacho *</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 sm:top-2.5 text-app-text/45 pointer-events-none" size={16} />
                <input
                  type="date"
                  required
                  id="input-pl-doc-date"
                  min={minDocDate}
                  value={docDate}
                  onChange={e => setDocDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-app-border rounded-lg text-sm focus:ring-2 focus:ring-app-primary bg-app-surface text-app-text min-h-[42px] sm:min-h-0"
                />
              </div>
            </div>

            <ClientSellerSelector
              clientId={clientId}
              setClientId={handleClientChange}
              clients={clients}
              onAddNewClient={handleAddNewClient}
              sellerId={sellerId}
              setSellerId={setSellerId}
              sellers={sellers}
              onAddNewSeller={handleAddNewSeller}
              formProviderId={formProviderId}
              setFormProviderId={setFormProviderId}
              providers={providers}
              onAddNewProvider={handleAddNewProvider}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 pt-3 border-t border-app-border/40">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-app-text/80 mb-1">Número de Guía</label>
              <input
                type="text"
                value={guideNumber}
                onChange={e => setGuideNumber(e.target.value)}
                placeholder="Ej. G001-000234 (Opcional)"
                className="w-full px-3 py-2 border border-app-border rounded-lg text-sm text-app-text focus:ring-2 focus:ring-app-primary bg-app-surface font-mono min-h-[42px] sm:min-h-0"
                id="input-pl-guide"
              />
              <p className="text-[11px] text-app-text/50 mt-1 leading-snug">
                Opcional. Puedes completarlo después si aún no tienes el número.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-app-text/80 mb-1">Dirección de Despacho</label>
              <input
                type="text"
                value={dispatchAddress}
                onChange={e => setDispatchAddress(e.target.value)}
                placeholder="Dirección de entrega (Sugerida del Cliente, Editable)"
                className="w-full px-3 py-2 border border-app-border rounded-lg text-sm text-app-text focus:ring-2 focus:ring-app-primary bg-app-surface min-h-[42px] sm:min-h-0"
                id="input-pl-dispatch-address"
              />
              <p className="text-[11px] text-app-text/50 mt-1 leading-snug">
                Se autocompleta con la dirección del cliente, pero puedes editarla.
              </p>
            </div>
          </div>
        </div>

        {/* Divisor Visual Sutil */}
        <hr className="border-app-border/60 my-4 sm:my-6" />

        {/* SECCIÓN 2: ARTÍCULOS Y ROLLOS */}
        <div className="p-3.5 sm:p-5 border border-app-border rounded-xl bg-app-bg/30 space-y-3 sm:space-y-4">
          <div className="flex flex-wrap justify-between items-center pb-2.5 border-b border-app-border gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-app-primary/10 text-app-primary">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
                  2. Artículos y Rollos
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddArticleGroup}
              className="px-4 py-2.5 sm:py-1.5 bg-app-primary hover:bg-app-primary/90 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs min-h-[42px] sm:min-h-0 w-full sm:w-auto"
              id="btn-add-article-section"
            >
              <Plus size={14} />
              Añadir Otro Artículo
            </button>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {articleGroups.map((group, index) => (
              <ArticleGroupSection
                key={group.id}
                group={group}
                index={index}
                articles={articles}
                providers={providers}
                packingType={packingType}
                availableRolls={availableRolls}
                allInventory={effectiveFullInventory}
                packingLists={packingLists}
                formProviderId={formProviderId}
                onRemove={handleRemoveArticleGroup}
                onGroupFieldChange={handleGroupFieldChange}
                onRollFieldChange={handleRollFieldChange}
                onAddRoll={handleAddRollToGroup}
                onRemoveRoll={handleRemoveRollFromGroup}
                onProcessUnifiedInput={handleProcessUnifiedInput}
                onRollKeyDown={handleRollKeyDown}
                onAddNewArticle={handleAddNewArticle}
                onSwitchToCorte={switchToCorteMode}
                onAddScannedRoll={handleAddScannedRollToGroup}
              />
            ))}
          </div>
        </div>

        {/* SECCIÓN 3: NOTAS ADICIONALES (Solo en Packing List de Corte) */}
        {packingType === 'corte' && (
          <>
            <hr className="border-app-border/60 my-4 sm:my-6" />
            <div className="p-3.5 sm:p-5 border border-app-border rounded-xl bg-app-bg/30 space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-app-border">
                <div className="p-1.5 rounded-md bg-app-primary/10 text-app-primary">
                  <FileText size={18} />
                </div>
                <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
                  3. Notas Adicionales
                </h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text/80 mb-1">
                  Notas / Observaciones (Se imprimirá en el Packing List)
                </label>
                <textarea
                  placeholder="Escriba alguna nota u observación para este packing list..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-surface focus:ring-2 focus:ring-app-primary placeholder:text-app-text/45 text-app-text"
                  id="input-pl-notes"
                />
              </div>
            </div>
          </>
        )}

        {/* Submit Actions - Floating Sticky Bar */}
        <div className="sticky bottom-0 z-20 bg-app-surface/95 backdrop-blur-xs border-t border-app-border p-3.5 sm:p-4 -mx-3.5 sm:-mx-6 -mb-3.5 sm:-mb-6 mt-6 shadow-lg flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 rounded-b-xl">
          
          {/* Live Summary metrics + Keyboard shortcut */}
          <div className="flex items-center justify-between sm:justify-start gap-2">
            {liveStats.totalRolls > 0 ? (
              <div className="flex items-center gap-2 bg-app-bg px-2.5 py-1.5 rounded-lg border border-app-border">
                <span className="text-[10px] font-bold text-app-text/60 uppercase">Total:</span>
                <span className="text-xs font-mono font-black text-app-primary">
                  {liveStats.totalRolls} {packingType === 'corte' ? 'cortes' : 'rollos'}
                </span>
                <span className="text-app-text/30">•</span>
                <span className="text-xs font-mono font-black text-app-secondary">
                  {liveStats.totalMeters.toFixed(2)} m
                </span>
                {liveStats.totalWeight > 0 && (
                  <>
                    <span className="text-app-text/30">•</span>
                    <span className="text-xs font-mono font-black text-app-text">
                      {liveStats.totalWeight.toFixed(2)} kg
                    </span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-app-text/45 font-semibold font-mono no-print">
                Atajo: <span className="bg-app-bg border border-app-border rounded px-1.5 py-0.5 font-bold">Ctrl + Enter</span>
              </span>
            )}
            {liveStats.totalRolls > 0 && (
              <span className="hidden md:inline text-[10px] text-app-text/45 font-semibold font-mono no-print ml-2">
                (Ctrl + Enter para guardar)
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {editingPackingList && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-4 py-2.5 bg-app-bg hover:bg-app-border text-app-text font-bold rounded-lg text-xs sm:text-sm transition cursor-pointer border border-app-border min-h-[42px] sm:min-h-0 flex items-center justify-center"
              >
                Cancelar {isDuplicate ? 'Duplicación' : 'Modificación'}
              </button>
            )}
            <button
              type="button"
              disabled={!hasContent && !editingPackingList && !isDuplicate}
              onClick={() => setIsResetConfirmOpen(true)}
              className={`px-3.5 py-2.5 border rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 ${
                (hasContent || editingPackingList || isDuplicate)
                  ? 'bg-red-50 dark:bg-red-950/10 hover:bg-red-100 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30 cursor-pointer'
                  : 'bg-app-surface/50 border-app-border text-app-text/30 cursor-not-allowed opacity-50'
              }`}
              id="btn-clear-packinglist"
              title="Borrar todos los datos ingresados en el formulario"
            >
              <Trash2 size={15} />
              <span>Limpiar</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-3 sm:py-2.5 text-white font-bold rounded-lg text-xs sm:text-sm transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] ${
                editingPackingList && !isDuplicate
                  ? 'bg-app-primary hover:bg-app-primary/90'
                  : 'bg-app-secondary hover:bg-app-secondary/90'
              }`}
              id="btn-submit-packinglist"
            >
              {loading 
                ? (editingPackingList && !isDuplicate ? 'Guardando...' : isDuplicate ? 'Duplicando...' : 'Generando...') 
                : (editingPackingList && !isDuplicate ? 'Guardar Cambios' : isDuplicate ? 'Crear Duplicado' : 'Guardar e Imprimir')}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </form>

      {/* Custom Form Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-950/40 p-5 flex items-center gap-3">
              <div className="bg-red-500 text-white p-2 rounded-lg">
                <Trash2 size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">LIMPIAR FORMULARIO</h4>
                <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mt-0.5">RESTABLECER CAMPOS</p>
              </div>
              <button 
                onClick={() => setIsResetConfirmOpen(false)} 
                className="ml-auto text-app-text/45 hover:text-app-text cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="space-y-4">
                <p className="text-xs font-medium leading-relaxed text-app-text/80">
                  ¿Está seguro de que desea limpiar todos los datos ingresados en el formulario? Esta acción no se puede deshacer.
                </p>
                
                {(editingPackingList || isDuplicate) && (
                  <div className="bg-amber-50 dark:bg-amber-950/15 border border-amber-200 dark:border-amber-900/30 rounded-lg p-3 text-[10px] text-amber-900 dark:text-amber-400 font-medium">
                    ⚠️ Se cancelará el modo de <strong>{isDuplicate ? 'duplicación' : 'edición'}</strong> actual y volverá al formulario de nuevo ingreso.
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3 py-1.5 hover:bg-app-border text-app-text/75 hover:text-app-text border border-app-border rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer uppercase tracking-wider"
              >
                <Trash2 size={12} />
                Confirmar Limpieza
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Missing Fields Confirmation Modal (Lote, Partida, Peso, Tono, Ancho) */}
      {missingFieldsConfirm && (
        <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up text-app-text">
            
            {/* Header */}
            <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-950/40 p-5 flex items-center gap-3">
              <div className="bg-amber-500 text-white p-2 rounded-lg">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">Campos No Encontrados</h4>
                <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-0.5">AVISO DE CONFIGURACIÓN DE PROVEEDOR</p>
              </div>
              <button 
                onClick={() => setMissingFieldsConfirm(null)} 
                className="ml-auto text-app-text/45 hover:text-app-text cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-xs font-medium leading-relaxed text-app-text/80">
                El proveedor seleccionado tiene configurados los siguientes campos en su perfil, pero <strong>no se encontraron datos</strong> o se encuentran vacíos en las filas ingresadas:
              </p>
              
              <div className="flex flex-wrap gap-1.5 bg-app-bg p-3 rounded-lg border border-app-border">
                {missingFieldsConfirm.fields.map(f => {
                  const fieldMap: Record<string, string> = {
                    lot: '🏷️ Lote',
                    partida: '📦 Partida',
                    tono: '🎨 Tono / Color',
                    width: '📏 Ancho',
                    weight: '⚖️ Peso'
                  };
                  return (
                    <span key={f} className="text-[11px] font-extrabold px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                      {fieldMap[f] || f.toUpperCase()}
                    </span>
                  );
                })}
              </div>

              <div className="bg-app-bg/50 border border-app-border/80 rounded-lg p-3 text-[11px] text-app-text/70 space-y-1">
                <p>• Si presiona <strong>"Aceptar y Continuar"</strong>, el documento se emitirá e imprimirá omitiendo estas columnas sin generar espacios en blanco.</p>
                <p>• Si presiona <strong>"Cancelar"</strong>, podrá volver al formulario para completar o pegar los datos faltantes.</p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-app-bg px-6 py-4 border-t border-app-border flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMissingFieldsConfirm(null)}
                className="px-3.5 py-2 hover:bg-app-border text-app-text/80 hover:text-app-text border border-app-border rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => missingFieldsConfirm.onConfirm()}
                className="px-4 py-2 bg-app-primary hover:bg-app-primary/90 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <CheckCircle2 size={14} />
                Aceptar y Continuar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TECHNICAL RESTING GUIDE PRINT MODAL */}
      {showRestingGuide && (
        <PrintRestingGuideModal
          onClose={() => setShowRestingGuide(false)}
        />
      )}
    </div>
  );
}
