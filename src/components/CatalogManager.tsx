import React, { useState, useEffect } from 'react';
import { Client, Seller, Provider, Article, PackingList, RollItem } from '../types';
import { db, addDoc, updateDoc, deleteDoc, fetchAllInventoryDocs } from '../firebase';
import { collection, doc } from 'firebase/firestore';
import { Plus, Edit2, Trash2, Users, User, Briefcase, Truck, Layers, Check, X, Search, FileSpreadsheet, Building, Loader2 } from 'lucide-react';
import { exportCatalogToExcel } from '../utils/excelExport';
import AlertBanner from './AlertBanner';
import { lookupRucOrDni } from '../lib/sunat';
import { useToast } from '../context/ToastContext';
import { analyzeSystemError } from '../lib/diagnostics';
import ClientPreferredSellerSelector from './ClientPreferredSellerSelector';

interface CatalogManagerProps {
  clients: Client[];
  sellers: Seller[];
  providers: Provider[];
  articles: Article[];
  packingLists: PackingList[];
  inventory: RollItem[];
  onRefresh: () => Promise<void>;
  initialTab?: CatalogTab;
  initialSearchQuery?: string;
}

type CatalogTab = 'providers' | 'articles' | 'clients' | 'sellers';

export default function CatalogManager({
  clients,
  sellers,
  providers,
  articles,
  packingLists,
  inventory,
  onRefresh,
  initialTab,
  initialSearchQuery
}: CatalogManagerProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<CatalogTab>('providers');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    title?: string;
    rootCause?: string;
    solution?: string;
    technicalDetails?: string;
  } | string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [similarityWarning, setSimilarityWarning] = useState<{
    isOpen: boolean;
    existingName: string;
    onConfirm: () => void;
  } | null>(null);

  // Handle external navigation/filtering from global search
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Form States
  // Provider Form
  const [provName, setProvName] = useState('');
  const [provHasLot, setProvHasLot] = useState(true);
  const [provHasPartida, setProvHasPartida] = useState(true);
  const [provHasTono, setProvHasTono] = useState(true);
  const [provHasRollNo, setProvHasRollNo] = useState(true);
  const [provHasWidth, setProvHasWidth] = useState(false);
  const [provHasWeight, setProvHasWeight] = useState(false);

  // Article Form
  const [artCode, setArtCode] = useState('');
  const [artName, setArtName] = useState('');
  const [artDesc, setArtDesc] = useState('');
  const [artUnit, setArtUnit] = useState('metros');
  const [artProvId, setArtProvId] = useState('');

  // Client Form
  const [cliName, setCliName] = useState('');
  const [cliDni, setCliDni] = useState('');
  const [cliEmail, setCliEmail] = useState('');
  const [cliPhone, setCliPhone] = useState('');
  const [cliFiscalAddress, setCliFiscalAddress] = useState('');
  const [cliAddress, setCliAddress] = useState('');
  const [cliContactPerson, setCliContactPerson] = useState('');
  const [cliDefaultSellerId, setCliDefaultSellerId] = useState('');
  const [loadingSunat, setLoadingSunat] = useState(false);
  const [sunatStatusMsg, setSunatStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSunatLookupClient = async () => {
    if (!cliDni.trim()) {
      setSunatStatusMsg({ type: 'error', text: 'Ingrese un número de RUC (11 dígitos) o DNI (8 dígitos).' });
      return;
    }
    setLoadingSunat(true);
    setSunatStatusMsg(null);
    const result = await lookupRucOrDni(cliDni);
    setLoadingSunat(false);
    if (result.success && result.name) {
      setCliName(result.name);
      if (result.address) {
        setCliFiscalAddress(result.address);
        // Leave cliAddress (Dirección de Entrega) empty by default so it can be filled separately!
      }
      setSunatStatusMsg({ 
        type: 'success', 
        text: `Consultado con éxito: ${result.name}${result.address ? ' | Dir. Fiscal: ' + result.address : ''}` 
      });
    } else {
      setSunatStatusMsg({ type: 'error', text: result.error || 'No se obtuvieron datos automáticos de SUNAT / RENIEC.' });
    }
  };

  // Seller Form
  const [selName, setSelName] = useState('');
  const [selEmail, setSelEmail] = useState('');
  const [selPhone, setSelPhone] = useState('');

  // Reset form inputs
  const resetForms = () => {
    setEditingId(null);
    setError(null);
    setSearchQuery('');
    
    // Providers
    setProvName('');
    setProvHasLot(true);
    setProvHasPartida(true);
    setProvHasTono(true);
    setProvHasRollNo(true);
    setProvHasWidth(false);
    setProvHasWeight(false);

    // Articles
    setArtCode('');
    setArtName('');
    setArtDesc('');
    setArtUnit('metros');
    setArtProvId(providers[0]?.id || '');

    // Clients
    setCliName('');
    setCliDni('');
    setCliEmail('');
    setCliPhone('');
    setCliFiscalAddress('');
    setCliAddress('');
    setCliContactPerson('');
    setCliDefaultSellerId('');

    // Sellers
    setSelName('');
    setSelEmail('');
    setSelPhone('');
  };

  const handleEditInit = (tab: CatalogTab, item: any) => {
    setEditingId(item.id);
    if (tab === 'providers') {
      setProvName(item.name);
      setProvHasLot(item.hasLot);
      setProvHasPartida(item.hasPartida);
      setProvHasTono(item.hasTono);
      setProvHasRollNo(item.hasRollNo ?? true);
      setProvHasWidth(item.hasWidth ?? false);
      setProvHasWeight(item.hasWeight ?? false);
    } else if (tab === 'articles') {
      setArtCode(item.code || '');
      setArtName(item.name);
      setArtDesc(item.description);
      setArtUnit(item.unit);
      setArtProvId(item.providerId);
    } else if (tab === 'clients') {
      setCliName(item.name);
      setCliDni(item.dni);
      setCliEmail(item.email);
      setCliPhone(item.phone);
      setCliFiscalAddress(item.fiscalAddress || '');
      setCliAddress(item.address || '');
      setCliContactPerson(item.contactPerson || '');
      setCliDefaultSellerId(item.defaultSellerId || '');
    } else if (tab === 'sellers') {
      setSelName(item.name);
      setSelEmail(item.email);
      setSelPhone(item.phone);
    }
  };

  const checkSimilarity = (newName: string, existingItems: { name: string }[]): string | null => {
    const s1 = (newName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!s1) return null;

    for (const item of existingItems) {
      const s2 = (item.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!s2) continue;

      // 1. Uno contiene al otro
      if (s1.includes(s2) || s2.includes(s1)) {
        return item.name;
      }

      // 2. Levenshtein similarity >= 0.85
      const len1 = s1.length;
      const len2 = s2.length;
      const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

      for (let i = 0; i <= len1; i++) matrix[i][0] = i;
      for (let j = 0; j <= len2; j++) matrix[0][j] = j;

      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }

      const distance = matrix[len1][len2];
      const maxLength = Math.max(len1, len2);
      const similarity = maxLength > 0 ? (maxLength - distance) / maxLength : 0;

      if (similarity >= 0.85) {
        return item.name;
      }
    }

    return null;
  };

  const executeSave = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'providers') {
        const providerData = {
          name: provName,
          hasLot: provHasLot,
          hasPartida: provHasPartida,
          hasTono: provHasTono,
          hasRollNo: provHasRollNo,
          hasWidth: provHasWidth,
          hasWeight: provHasWeight
        };

        if (editingId) {
          await updateDoc(doc(db, 'providers', editingId), providerData);
        } else {
          await addDoc(collection(db, 'providers'), {
            ...providerData,
            createdAt: new Date().toISOString()
          });
        }
      } 
      
      else if (activeTab === 'articles') {
        const articleData = {
          code: artCode.trim(),
          name: artName,
          description: artDesc,
          unit: artUnit,
          providerId: artProvId
        };

        if (editingId) {
          await updateDoc(doc(db, 'articles', editingId), articleData);
        } else {
          await addDoc(collection(db, 'articles'), {
            ...articleData,
            createdAt: new Date().toISOString()
          });
        }
      } 
      
      else if (activeTab === 'clients') {
        const clientData = {
          name: cliName,
          dni: cliDni,
          email: cliEmail,
          phone: cliPhone,
          fiscalAddress: cliFiscalAddress,
          address: cliAddress,
          contactPerson: cliContactPerson,
          defaultSellerId: cliDefaultSellerId || ''
        };

        if (editingId) {
          await updateDoc(doc(db, 'clients', editingId), clientData);
        } else {
          await addDoc(collection(db, 'clients'), {
            ...clientData,
            createdAt: new Date().toISOString()
          });
        }
      } 
      
      else if (activeTab === 'sellers') {
        const sellerData = {
          name: selName,
          email: selEmail,
          phone: selPhone
        };

        if (editingId) {
          await updateDoc(doc(db, 'sellers', editingId), sellerData);
        } else {
          await addDoc(collection(db, 'sellers'), {
            ...sellerData,
            createdAt: new Date().toISOString()
          });
        }
      }

      await onRefresh();
      toast.success(editingId ? 'Registro actualizado correctamente en el catálogo.' : 'Nuevo registro agregado con éxito.');
      resetForms();
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'guardar registro en el catálogo', entity: activeTab });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'guardar en catálogo', entity: activeTab });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'providers') {
        if (!provName.trim()) {
          const diag = {
            title: 'Nombre de Proveedor Requerido',
            message: 'El nombre del proveedor es obligatorio.',
            rootCause: 'El campo de nombre comercial del proveedor se encuentra en blanco.',
            solution: 'Ingrese el nombre o razón social del proveedor textil.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
      } else if (activeTab === 'articles') {
        if (!artName.trim()) {
          const diag = {
            title: 'Nombre de Artículo Requerido',
            message: 'El nombre del artículo es obligatorio.',
            rootCause: 'El nombre de la tela o artículo no puede estar vacío.',
            solution: 'Escriba la denominación del artículo (ej. Franela Reactiva 30/1).'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
        if (!artProvId) {
          const diag = {
            title: 'Proveedor no Asociado',
            message: 'Debe asociar un proveedor.',
            rootCause: 'No se seleccionó el proveedor de origen del artículo.',
            solution: 'Seleccione un proveedor de la lista desplegable.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
      } else if (activeTab === 'clients') {
        if (!cliName.trim()) {
          const diag = {
            title: 'Nombre de Cliente Requerido',
            message: 'El nombre del cliente es obligatorio.',
            rootCause: 'El campo de nombre o razón social del cliente está vacío.',
            solution: 'Ingrese la razón social o consulte el documento en SUNAT / RENIEC.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
        if (!cliDni.trim()) {
          const diag = {
            title: 'Documento de Identidad Requerido',
            message: 'El DNI o RUC es obligatorio.',
            rootCause: 'No se ha indicado el número de documento de identidad del cliente.',
            solution: 'Ingrese un DNI (8 dígitos) o RUC (11 dígitos) válido.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }

        // Validación de RUC/DNI Único
        const normalizedCliDni = cliDni.trim().toLowerCase().replace(/\s+/g, '');
        const duplicateClient = clients.find(c => {
          if (editingId && c.id === editingId) return false;
          const existingDni = (c.dni || '').trim().toLowerCase().replace(/\s+/g, '');
          return existingDni !== '' && existingDni === normalizedCliDni;
        });

        if (duplicateClient) {
          const diag = {
            title: 'Documento de Identidad Duplicado',
            message: `Ya existe un cliente registrado con el RUC/DNI '${cliDni.trim()}': ${duplicateClient.name}. Verifique si es el mismo cliente antes de crear un registro duplicado.`,
            rootCause: `El RUC/DNI ingresado ya está asignado al cliente '${duplicateClient.name}' en la base de datos.`,
            solution: 'Utilice el cliente ya existente o verifique que el número de documento digitado sea el correcto.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
      } else if (activeTab === 'sellers') {
        if (!selName.trim()) {
          const diag = {
            title: 'Nombre de Vendedor Requerido',
            message: 'El nombre del vendedor es obligatorio.',
            rootCause: 'El campo de nombre del vendedor está en blanco.',
            solution: 'Ingrese el nombre y apellido del vendedor asignado.'
          };
          setError(diag);
          toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
          setLoading(false);
          return;
        }
      }

      if (!editingId) {
        let inputName = '';
        let existingList: { name: string }[] = [];

        if (activeTab === 'providers') {
          inputName = provName;
          existingList = providers;
        } else if (activeTab === 'articles') {
          inputName = artName;
          existingList = articles;
        } else if (activeTab === 'clients') {
          inputName = cliName;
          existingList = clients;
        } else if (activeTab === 'sellers') {
          inputName = selName;
          existingList = sellers;
        }

        const similarName = checkSimilarity(inputName, existingList);
        if (similarName) {
          setSimilarityWarning({
            isOpen: true,
            existingName: similarName,
            onConfirm: () => {
              setSimilarityWarning(null);
              executeSave();
            }
          });
          setLoading(false);
          return;
        }
      }

      await executeSave();
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'guardar el registro en el catálogo', entity: activeTab });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'guardar registro', entity: activeTab });
      setLoading(false);
    }
  };

  const handleDelete = async (tab: CatalogTab, id: string) => {
    let count = 0;
    const dependencyDetails: string[] = [];

    setDeletingId(id);
    setError(null);

    try {
      if (tab === 'clients') {
        const plCount = packingLists.filter(pl => pl.clientId === id).length;
        count = plCount;
        if (plCount > 0) dependencyDetails.push(`${plCount} Packing List(s)`);
      } else if (tab === 'sellers') {
        const plCount = packingLists.filter(pl => pl.sellerId === id).length;
        count = plCount;
        if (plCount > 0) dependencyDetails.push(`${plCount} Packing List(s)`);
      } else if (tab === 'providers') {
        const plCount = packingLists.filter(pl => pl.items?.some(item => item.providerId === id)).length;
        const artCount = articles.filter(art => art.providerId === id).length;
        const fullInventory = await fetchAllInventoryDocs();
        const invCount = fullInventory.filter(r => r.providerId === id).length;
        count = plCount + artCount + invCount;
        if (plCount > 0) dependencyDetails.push(`${plCount} Packing List(s)`);
        if (artCount > 0) dependencyDetails.push(`${artCount} Artículo(s) en catálogo`);
        if (invCount > 0) dependencyDetails.push(`${invCount} Rollo(s) en inventario`);
      } else if (tab === 'articles') {
        const plCount = packingLists.filter(pl => pl.items?.some(item => item.articleId === id)).length;
        const fullInventory = await fetchAllInventoryDocs();
        const invCount = fullInventory.filter(r => r.articleId === id).length;
        count = plCount + invCount;
        if (plCount > 0) dependencyDetails.push(`${plCount} Packing List(s)`);
        if (invCount > 0) dependencyDetails.push(`${invCount} Rollo(s) en inventario`);
      }

      if (count > 0) {
        const entityLabel = tab === 'clients' ? 'cliente' : tab === 'sellers' ? 'vendedor' : tab === 'providers' ? 'proveedor' : 'artículo';
        const depsText = dependencyDetails.join(', ');
        const diag = {
          title: 'Integridad Referencial Protegida',
          message: `No se puede eliminar este ${entityLabel} porque tiene registros activos asociados: ${depsText}.`,
          rootCause: `Existen dependencias activas (${depsText}) que requieren la existencia de este ${entityLabel}.`,
          solution: `Para eliminarlo, primero reasigne o elimine los ${depsText} asociados a este registro.`
        };
        setError(diag);
        toast.warning(diag.message, { title: diag.title, rootCause: diag.rootCause, solution: diag.solution });
        return;
      }

      if (!window.confirm('¿Está seguro de eliminar este registro del catálogo?')) return;
      setLoading(true);
      try {
        await deleteDoc(doc(db, tab, id));
        await onRefresh();
        toast.success('Registro eliminado del catálogo correctamente.');
        resetForms();
      } catch (err: any) {
        console.error(err);
        const diag = analyzeSystemError(err, { action: 'eliminar registro del catálogo', entity: tab });
        setError({
          title: diag.title,
          message: diag.message,
          rootCause: diag.rootCause,
          solution: diag.solution,
          technicalDetails: diag.technicalDetails
        });
        toast.diagnose(err, { action: 'eliminar del catálogo', entity: tab });
      } finally {
        setLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      const diag = analyzeSystemError(err, { action: 'verificar dependencias de inventario', entity: tab });
      setError({
        title: diag.title,
        message: diag.message,
        rootCause: diag.rootCause,
        solution: diag.solution,
        technicalDetails: diag.technicalDetails
      });
      toast.diagnose(err, { action: 'verificar dependencias', entity: tab });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCatalogExcel = () => {
    let listToExport: any[] = [];
    const q = (searchQuery || '').toLowerCase().trim();
    if (activeTab === 'clients') {
      listToExport = clients.filter(c => {
        if (!q) return true;
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.dni || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.address || '').toLowerCase().includes(q)
        );
      });
    } else if (activeTab === 'articles') {
      listToExport = articles.filter(a => {
        if (!q) return true;
        const prov = providers.find(p => p.id === a.providerId);
        return (
          (a.code || '').toLowerCase().includes(q) ||
          (a.name || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q) ||
          (prov?.name || '').toLowerCase().includes(q)
        );
      });
    } else if (activeTab === 'providers') {
      listToExport = providers.filter(p => {
        if (!q) return true;
        return (p.name || '').toLowerCase().includes(q);
      });
    } else if (activeTab === 'sellers') {
      listToExport = sellers.filter(s => {
        if (!q) return true;
        return (
          (s.name || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q)
        );
      });
    }

    exportCatalogToExcel(activeTab, listToExport, { providers, articles, sellers });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-1">
      {/* Sidebar navigation */}
      <div className="lg:col-span-1 ticket-perforated p-4 shadow-xs space-y-1">
        <h3 className="font-bold text-app-text/80 text-xs mb-3 px-2 uppercase tracking-wider">Gestión de Catálogos</h3>
        
        <button
          onClick={() => { setActiveTab('providers'); resetForms(); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            activeTab === 'providers'
              ? 'bg-app-bg text-app-text border-l-2 border-app-primary'
              : 'text-app-text/70 hover:bg-app-bg/50'
          }`}
          id="tab-cat-providers"
        >
          <Truck size={15} />
          Agregar Proveedor
        </button>

        <button
          onClick={() => { setActiveTab('articles'); resetForms(); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            activeTab === 'articles'
              ? 'bg-app-bg text-app-text border-l-2 border-app-primary'
              : 'text-app-text/70 hover:bg-app-bg/50'
          }`}
          id="tab-cat-articles"
        >
          <Layers size={15} />
          Agregar Artículo
        </button>

        <button
          onClick={() => { setActiveTab('clients'); resetForms(); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            activeTab === 'clients'
              ? 'bg-app-bg text-app-text border-l-2 border-app-primary'
              : 'text-app-text/70 hover:bg-app-bg/50'
          }`}
          id="tab-cat-clients"
        >
          <Users size={15} />
          Agregar Cliente
        </button>

        <button
          onClick={() => { setActiveTab('sellers'); resetForms(); }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
            activeTab === 'sellers'
              ? 'bg-app-bg text-app-text border-l-2 border-app-primary'
              : 'text-app-text/70 hover:bg-app-bg/50'
          }`}
          id="tab-cat-sellers"
        >
          <Briefcase size={15} />
          Agregar Vendedor
        </button>
      </div>

      {/* Form and List Column */}
      <div className="lg:col-span-3 space-y-6">
        {/* Error box */}
        {error && (
          <AlertBanner
            type="error"
            message={typeof error === 'string' ? error : error.message}
            title={typeof error === 'object' ? error.title : undefined}
            rootCause={typeof error === 'object' ? error.rootCause : undefined}
            solution={typeof error === 'object' ? error.solution : undefined}
            technicalDetails={typeof error === 'object' ? error.technicalDetails : undefined}
            onClose={() => setError(null)}
            id="alert-cat-error"
          />
        )}

        {/* Dynamic Form Card */}
        <div className="ticket-perforated p-5 shadow-xs">
          <h2 className="text-xs font-bold text-app-text uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-app-border pb-3">
            <Plus size={14} className="text-app-text/50" />
            {editingId ? 'Editar Registro' : 'Agregar Nuevo Registro'}: {
              activeTab === 'providers' ? 'Proveedor' :
              activeTab === 'articles' ? 'Artículo' :
              activeTab === 'clients' ? 'Cliente' : 'Vendedor'
            }
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            {/* providers inputs */}
            {activeTab === 'providers' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Nombre Comercial del Proveedor *</label>
                  <input
                    type="text"
                    required
                    value={provName}
                    onChange={e => setProvName(e.target.value)}
                    placeholder="Ej. Textiles del Sur S.A.C."
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                    id="input-prov-name"
                  />
                </div>
                
                <div>
                  <span className="block text-xs font-bold text-app-text/80 mb-2 uppercase tracking-wider">Configuración Dinámica de Parámetros de Stock:</span>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-3 bg-app-bg/40 border border-app-border rounded">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasLot}
                        onChange={e => setProvHasLot(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Lote
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasPartida}
                        onChange={e => setProvHasPartida(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Partida
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasTono}
                        onChange={e => setProvHasTono(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Tono
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasRollNo}
                        onChange={e => setProvHasRollNo(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Nº Rollo
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasWidth}
                        onChange={e => setProvHasWidth(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Ancho
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-app-text/90">
                      <input
                        type="checkbox"
                        checked={provHasWeight}
                        onChange={e => setProvHasWeight(e.target.checked)}
                        className="rounded text-app-primary focus:ring-app-primary h-4 w-4"
                      />
                      Maneja Peso
                    </label>
                  </div>
                  <p className="text-[10px] text-app-text/50 mt-1.5">
                    * Al marcar o desmarcar, los packing lists y formularios de inventario habilitarán dinámicamente estos campos según el proveedor elegido.
                  </p>
                </div>
              </div>
            )}

            {/* articles inputs */}
            {activeTab === 'articles' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Código (Opcional)</label>
                  <input
                    type="text"
                    value={artCode}
                    onChange={e => setArtCode(e.target.value)}
                    placeholder="Ej. DEN-1408"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary font-mono"
                    id="input-art-code"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Nombre del Artículo *</label>
                  <input
                    type="text"
                    required
                    value={artName}
                    onChange={e => setArtName(e.target.value)}
                    placeholder="Ej. Sarga Stretch Denim Azul Forte"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                    id="input-art-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Proveedor Asociado *</label>
                  <select
                    required
                    value={artProvId}
                    onChange={e => setArtProvId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                    id="input-art-prov"
                  >
                    <option value="">-- Seleccionar Proveedor --</option>
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Descripción / Notas</label>
                  <input
                    type="text"
                    value={artDesc}
                    onChange={e => setArtDesc(e.target.value)}
                    placeholder="Ej. Gramaje 14oz, ancho 1.75m"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Unidad de Medida</label>
                  <input
                    type="text"
                    required
                    value={artUnit}
                    onChange={e => setArtUnit(e.target.value)}
                    className="w-full px-3 py-1.5 bg-app-bg border border-app-border rounded text-app-text/75 text-xs font-medium"
                    readOnly
                  />
                </div>
              </div>
            )}

            {/* clients inputs */}
            {activeTab === 'clients' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Nombre Completo / Razón Social *</label>
                  <input
                    type="text"
                    required
                    value={cliName}
                    onChange={e => setCliName(e.target.value)}
                    placeholder="Ej. Confecciones Gamarra S.A.C. / Juan Pérez"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                    id="input-cli-name"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-app-text/80 uppercase tracking-wider">DNI / RUC *</label>
                    <button
                      type="button"
                      onClick={handleSunatLookupClient}
                      disabled={loadingSunat || !cliDni.trim()}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-app-primary hover:underline disabled:opacity-50 cursor-pointer"
                      title="Consultar Razón Social / Nombres y Dirección Fiscal en SUNAT / RENIEC"
                    >
                      {loadingSunat ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Consultando...
                        </>
                      ) : (
                        <>
                          <Building size={12} />
                          Consultar SUNAT / RENIEC
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      value={cliDni}
                      onChange={e => setCliDni(e.target.value)}
                      placeholder="DNI (8 dígitos) o RUC (11 dígitos)"
                      className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                      id="input-cli-dni"
                    />
                  </div>
                  {sunatStatusMsg && (
                    <div className={`mt-1 text-[10px] font-medium p-1 rounded ${sunatStatusMsg.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                      {sunatStatusMsg.text}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Correo Electrónico</label>
                  <input
                    type="email"
                    value={cliEmail}
                    onChange={e => setCliEmail(e.target.value)}
                    placeholder="correo@cliente.com"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Teléfono</label>
                  <input
                    type="text"
                    value={cliPhone}
                    onChange={e => setCliPhone(e.target.value)}
                    placeholder="Celular de contacto"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Dirección Fiscal (SUNAT / Domicilio)</label>
                  <input
                    type="text"
                    value={cliFiscalAddress}
                    onChange={e => setCliFiscalAddress(e.target.value)}
                    placeholder="Ej. Av. Nicolás Ayllón 1234 - San Luis - Lima - Lima"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-app-text/80 uppercase tracking-wider">Dirección de Entrega / Despacho</label>
                    {cliFiscalAddress && (
                      <button
                        type="button"
                        onClick={() => setCliAddress(cliFiscalAddress)}
                        className="text-[10px] text-app-primary hover:underline font-bold cursor-pointer"
                      >
                        Copiar Dir. Fiscal
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={cliAddress}
                    onChange={e => setCliAddress(e.target.value)}
                    placeholder="Lugar de entrega, agencia o almacén (En blanco por defecto)"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Nombre del Encargado / Contacto de Despacho</label>
                  <input
                    type="text"
                    value={cliContactPerson}
                    onChange={e => setCliContactPerson(e.target.value)}
                    placeholder="Ej. Juan Pérez (Encargado de Recepción)"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div className="md:col-span-2 pt-0.5">
                  <ClientPreferredSellerSelector
                    sellerId={cliDefaultSellerId}
                    onSelectSeller={setCliDefaultSellerId}
                    sellers={sellers}
                  />
                </div>
              </div>
            )}

            {/* sellers inputs */}
            {activeTab === 'sellers' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Nombre del Vendedor *</label>
                  <input
                    type="text"
                    required
                    value={selName}
                    onChange={e => setSelName(e.target.value)}
                    placeholder="Ej. Roberto Benavides"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                    id="input-sel-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Correo de Contacto</label>
                  <input
                    type="email"
                    value={selEmail}
                    onChange={e => setSelEmail(e.target.value)}
                    placeholder="vendedor@empresa.com"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text/80 mb-1 uppercase tracking-wider">Teléfono Móvil</label>
                  <input
                    type="text"
                    value={selPhone}
                    onChange={e => setSelPhone(e.target.value)}
                    placeholder="900000000"
                    className="w-full px-3 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary"
                  />
                </div>
              </div>
            )}

            {/* Form actions */}
            <div className="flex justify-end gap-2 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-4 py-1.5 border border-app-border hover:bg-app-bg text-app-text rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Cancelar Edición
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs disabled:opacity-50"
                id="btn-save-catalog"
              >
                {loading ? 'Guardando...' : editingId ? 'Actualizar Registro' : 'Guardar en Catálogo'}
              </button>
            </div>
          </form>
        </div>

        {/* Catalog List */}
        <div className="ticket-perforated p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app-border pb-4 mb-4">
            <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
              Registros Existentes en {
                activeTab === 'providers' ? 'Proveedores' :
                activeTab === 'articles' ? 'Artículos' :
                activeTab === 'clients' ? 'Clientes' : 'Vendedores'
              }
            </h3>
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportCatalogExcel}
                className="px-3.5 py-1.5 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs uppercase tracking-wider shrink-0"
                title={`Exportar ${activeTab} a Excel`}
              >
                <FileSpreadsheet size={14} className="text-app-text/60" />
                Exportar Excel
              </button>
              <div className="relative w-full sm:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-app-text/50">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder={`Buscar ${
                    activeTab === 'providers' ? 'proveedor...' :
                    activeTab === 'articles' ? 'código, tela o descripción...' :
                    activeTab === 'clients' ? 'cliente, RUC/DNI...' : 'vendedor...'
                  }`}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 border border-app-border rounded bg-app-surface text-app-text text-xs focus:outline-hidden focus:ring-1 focus:ring-app-primary placeholder:text-app-text/45"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-app-text/50 hover:text-app-text"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'providers' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-app-bg/40 border-b border-app-border text-xs text-app-text/60 uppercase font-semibold">
                    <th className="p-3">Nombre del Proveedor</th>
                    <th className="p-3">Lote</th>
                    <th className="p-3">Partida</th>
                    <th className="p-3">Tono</th>
                    <th className="p-3">Nº Rollo</th>
                    <th className="p-3">Ancho</th>
                    <th className="p-3">Peso</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/40 text-sm bg-app-surface">
                  {providers.filter(p => {
                    const q = (searchQuery || '').toLowerCase().trim();
                    if (!q) return true;
                    return (p.name || '').toLowerCase().includes(q);
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center">
                        <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                          <div className="w-14 h-14 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                            {providers.length === 0 ? <Truck size={28} /> : <Search size={28} className="text-app-text/40" />}
                          </div>
                          <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-1">
                            {providers.length === 0 ? 'No hay proveedores registrados' : 'Sin resultados de proveedores'}
                          </h4>
                          <p className="text-[11px] text-app-text/60 font-medium leading-relaxed mb-3">
                            {providers.length === 0
                              ? 'Agregue su primer proveedor comercial para configurar parámetros de lotes, partidas y telas.'
                              : 'No se encontró ningún proveedor con el término de búsqueda ingresado.'}
                          </p>
                          {providers.length === 0 ? (
                            <button
                              onClick={() => {
                                const el = document.getElementById('input-prov-name');
                                el?.focus();
                              }}
                              className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-1.5 transition shadow-xs uppercase tracking-wider cursor-pointer"
                            >
                              <Plus size={13} />
                              Agregar primer proveedor
                            </button>
                          ) : searchQuery ? (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="px-3 py-1 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                            >
                              Limpiar Búsqueda
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    providers.filter(p => {
                      const q = (searchQuery || '').toLowerCase().trim();
                      if (!q) return true;
                      return (p.name || '').toLowerCase().includes(q);
                    }).map(p => (
                      <tr key={p.id} className="hover:bg-app-bg/40 border-b border-app-border/60 text-xs">
                        <td className="p-3 font-semibold text-app-text">{p.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${p.hasLot ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {p.hasLot ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${p.hasPartida ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {p.hasPartida ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${p.hasTono ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {p.hasTono ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${(p.hasRollNo ?? true) ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {(p.hasRollNo ?? true) ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${p.hasWidth ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {p.hasWidth ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold border ${p.hasWeight ? 'bg-app-bg text-app-text border-app-border' : 'bg-app-surface text-app-text/40 border-app-border/40'}`}>
                            {p.hasWeight ? 'SÍ' : 'NO'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditInit('providers', p)}
                              className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                              title="Editar Proveedor"
                            >
                              <Edit2 size={12} />
                              <span className="hidden md:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => handleDelete('providers', p.id)}
                              disabled={deletingId === p.id || loading}
                              className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-600 hover:text-white rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Eliminar Proveedor"
                            >
                              {deletingId === p.id ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Verificando...</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 size={12} />
                                  <span className="hidden md:inline">Eliminar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'articles' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-app-bg/40 border-b border-app-border text-xs text-app-text/60 uppercase font-semibold">
                    <th className="p-3">Código</th>
                    <th className="p-3">Nombre Tela / Artículo</th>
                    <th className="p-3">Descripción / Gramaje</th>
                    <th className="p-3">Proveedor Asociado</th>
                    <th className="p-3">Unidad</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/40 text-sm bg-app-surface">
                  {articles.filter(a => {
                    const q = (searchQuery || '').toLowerCase().trim();
                    if (!q) return true;
                    const prov = providers.find(p => p.id === a.providerId);
                    return (
                      (a.code || '').toLowerCase().includes(q) ||
                      (a.name || '').toLowerCase().includes(q) ||
                      (a.description || '').toLowerCase().includes(q) ||
                      (prov?.name || '').toLowerCase().includes(q)
                    );
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
                        <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                          <div className="w-14 h-14 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                            {articles.length === 0 ? <Layers size={28} /> : <Search size={28} className="text-app-text/40" />}
                          </div>
                          <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-1">
                            {articles.length === 0 ? 'No hay artículos registrados' : 'Sin resultados de artículos'}
                          </h4>
                          <p className="text-[11px] text-app-text/60 font-medium leading-relaxed mb-3">
                            {articles.length === 0
                              ? 'Registre las telas y articulos que comercializa para usarlos en los packing lists e inventario.'
                              : 'No se encontraron telas que coincidan con la búsqueda.'}
                          </p>
                          {articles.length === 0 ? (
                            <button
                              onClick={() => {
                                const el = document.getElementById('input-art-code') || document.getElementById('input-art-name');
                                el?.focus();
                              }}
                              className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-1.5 transition shadow-xs uppercase tracking-wider cursor-pointer"
                            >
                              <Plus size={13} />
                              Agregar primer artículo
                            </button>
                          ) : searchQuery ? (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="px-3 py-1 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                            >
                              Limpiar Búsqueda
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    articles.filter(a => {
                      const q = (searchQuery || '').toLowerCase().trim();
                      if (!q) return true;
                      const prov = providers.find(p => p.id === a.providerId);
                      return (
                        (a.code || '').toLowerCase().includes(q) ||
                        (a.name || '').toLowerCase().includes(q) ||
                        (a.description || '').toLowerCase().includes(q) ||
                        (prov?.name || '').toLowerCase().includes(q)
                      );
                    }).map(a => {
                      const prov = providers.find(p => p.id === a.providerId);
                      return (
                        <tr key={a.id} className="hover:bg-app-bg/40 border-b border-app-border/60 text-xs">
                          <td className="p-3 font-mono font-bold text-app-primary">{a.code || '-'}</td>
                          <td className="p-3 font-semibold text-app-text">{a.name}</td>
                          <td className="p-3 text-app-text/60">{a.description || '-'}</td>
                          <td className="p-3 font-medium text-app-text/90">{prov?.name || 'Proveedor Eliminado'}</td>
                          <td className="p-3 text-xs font-mono text-app-text/60">{a.unit}</td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleEditInit('articles', a)}
                                className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                                title="Editar Artículo"
                              >
                                <Edit2 size={12} />
                                <span className="hidden md:inline">Editar</span>
                              </button>
                              <button
                                onClick={() => handleDelete('articles', a.id)}
                                disabled={deletingId === a.id || loading}
                                className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-600 hover:text-white rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar Artículo"
                              >
                                {deletingId === a.id ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin" />
                                    <span>Verificando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Trash2 size={12} />
                                    <span className="hidden md:inline">Eliminar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'clients' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-app-bg/40 border-b border-app-border text-xs text-app-text/60 uppercase font-semibold">
                    <th className="p-3">Cliente / Razón Social</th>
                    <th className="p-3">DNI / RUC</th>
                    <th className="p-3">Vendedor Habitual</th>
                    <th className="p-3">Contacto</th>
                    <th className="p-3">Dirección Fiscal</th>
                    <th className="p-3">Dirección de Despacho</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/40 text-sm bg-app-surface">
                  {clients.filter(c => {
                    const q = (searchQuery || '').toLowerCase().trim();
                    if (!q) return true;
                    const defSellerName = sellers.find(s => s.id === c.defaultSellerId)?.name || '';
                    return (
                      (c.name || '').toLowerCase().includes(q) ||
                      (c.dni || '').toLowerCase().includes(q) ||
                      (c.email || '').toLowerCase().includes(q) ||
                      (c.phone || '').toLowerCase().includes(q) ||
                      (c.fiscalAddress || '').toLowerCase().includes(q) ||
                      (c.address || '').toLowerCase().includes(q) ||
                      defSellerName.toLowerCase().includes(q)
                    );
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center">
                        <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                          <div className="w-14 h-14 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                            {clients.length === 0 ? <Users size={28} /> : <Search size={28} className="text-app-text/40" />}
                          </div>
                          <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-1">
                            {clients.length === 0 ? 'No hay clientes registrados' : 'Sin resultados de clientes'}
                          </h4>
                          <p className="text-[11px] text-app-text/60 font-medium leading-relaxed mb-3">
                            {clients.length === 0
                              ? 'Cree el registro de su primer cliente para acelerar la emisión de documentos de despacho.'
                              : 'No se encontraron clientes con los criterios ingresados.'}
                          </p>
                          {clients.length === 0 ? (
                            <button
                              onClick={() => {
                                const el = document.getElementById('input-cli-name');
                                el?.focus();
                              }}
                              className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-1.5 transition shadow-xs uppercase tracking-wider cursor-pointer"
                            >
                              <Plus size={13} />
                              Agregar primer cliente
                            </button>
                          ) : searchQuery ? (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="px-3 py-1 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                            >
                              Limpiar Búsqueda
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clients.filter(c => {
                      const q = (searchQuery || '').toLowerCase().trim();
                      if (!q) return true;
                      const defSellerName = sellers.find(s => s.id === c.defaultSellerId)?.name || '';
                      return (
                        (c.name || '').toLowerCase().includes(q) ||
                        (c.dni || '').toLowerCase().includes(q) ||
                        (c.email || '').toLowerCase().includes(q) ||
                        (c.phone || '').toLowerCase().includes(q) ||
                        (c.contactPerson || '').toLowerCase().includes(q) ||
                        (c.fiscalAddress || '').toLowerCase().includes(q) ||
                        (c.address || '').toLowerCase().includes(q) ||
                        defSellerName.toLowerCase().includes(q)
                      );
                    }).map(c => (
                      <tr key={c.id} className="hover:bg-app-bg/40 border-b border-app-border/60 text-xs">
                        <td className="p-3 font-semibold text-app-text">{c.name}</td>
                        <td className="p-3 font-mono text-xs text-app-text/90">{c.dni}</td>
                        <td className="p-3 text-xs">
                          {c.defaultSellerId && sellers.some(s => s.id === c.defaultSellerId) ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-app-primary bg-app-primary/10 border border-app-primary/20 px-2 py-0.5 rounded text-[11px]">
                              <User size={11} className="shrink-0" />
                              {sellers.find(s => s.id === c.defaultSellerId)?.name}
                            </span>
                          ) : (
                            <span className="text-app-text/40 text-[11px] italic">
                              Auto (Por historial)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {c.contactPerson && <div className="text-app-primary font-bold">{c.contactPerson}</div>}
                          {c.phone && <div className="text-app-text/60 font-mono">{c.phone}</div>}
                          {c.email && <div className="text-app-text/40 text-[10px] truncate">{c.email}</div>}
                        </td>
                        <td className="p-3 text-xs text-app-text/70 max-w-[200px] truncate" title={c.fiscalAddress}>{c.fiscalAddress || '-'}</td>
                        <td className="p-3 text-xs text-app-text/60 max-w-[200px] truncate" title={c.address}>{c.address || '-'}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditInit('clients', c)}
                              className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                              title="Editar Cliente"
                            >
                              <Edit2 size={12} />
                              <span className="hidden md:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => handleDelete('clients', c.id)}
                              disabled={deletingId === c.id || loading}
                              className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-600 hover:text-white rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Eliminar Cliente"
                            >
                              {deletingId === c.id ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Verificando...</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 size={12} />
                                  <span className="hidden md:inline">Eliminar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'sellers' && (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-app-bg/40 border-b border-app-border text-xs text-app-text/60 uppercase font-semibold">
                    <th className="p-3">Nombre del Vendedor</th>
                    <th className="p-3">Correo Electrónico</th>
                    <th className="p-3">Teléfono</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/40 text-sm bg-app-surface">
                  {sellers.filter(s => {
                    const q = (searchQuery || '').toLowerCase().trim();
                    if (!q) return true;
                    return (
                      (s.name || '').toLowerCase().includes(q) ||
                      (s.email || '').toLowerCase().includes(q) ||
                      (s.phone || '').toLowerCase().includes(q)
                    );
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center">
                        <div className="max-w-sm mx-auto flex flex-col items-center justify-center text-center">
                          <div className="w-14 h-14 rounded-full bg-app-bg border border-app-border flex items-center justify-center text-app-primary mb-3 shadow-xs">
                            {sellers.length === 0 ? <Briefcase size={28} /> : <Search size={28} className="text-app-text/40" />}
                          </div>
                          <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mb-1">
                            {sellers.length === 0 ? 'No hay vendedores registrados' : 'Sin resultados de vendedores'}
                          </h4>
                          <p className="text-[11px] text-app-text/60 font-medium leading-relaxed mb-3">
                            {sellers.length === 0
                              ? 'Registre al equipo de ventas para asignar responsables en cada emisión de packing list.'
                              : 'No se encontraron vendedores que coincidan con la búsqueda.'}
                          </p>
                          {sellers.length === 0 ? (
                            <button
                              onClick={() => {
                                const el = document.getElementById('input-sel-name');
                                el?.focus();
                              }}
                              className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold rounded text-xs flex items-center gap-1.5 transition shadow-xs uppercase tracking-wider cursor-pointer"
                            >
                              <Plus size={13} />
                              Agregar primer vendedor
                            </button>
                          ) : searchQuery ? (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="px-3 py-1 bg-app-surface hover:bg-app-bg text-app-text border border-app-border rounded text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                            >
                              Limpiar Búsqueda
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sellers.filter(s => {
                      const q = (searchQuery || '').toLowerCase().trim();
                      if (!q) return true;
                      return (
                        (s.name || '').toLowerCase().includes(q) ||
                        (s.email || '').toLowerCase().includes(q) ||
                        (s.phone || '').toLowerCase().includes(q)
                      );
                    }).map(s => (
                      <tr key={s.id} className="hover:bg-app-bg/40 border-b border-app-border/60 text-xs">
                        <td className="p-3 font-semibold text-app-text">{s.name}</td>
                        <td className="p-3 text-xs font-mono text-app-text/90">{s.email || '-'}</td>
                        <td className="p-3 text-xs text-app-text/60">{s.phone || '-'}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditInit('sellers', s)}
                              className="px-2 py-1 bg-app-surface hover:bg-app-bg text-app-text/70 hover:text-app-text border border-app-border rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                              title="Editar Vendedor"
                            >
                              <Edit2 size={12} />
                              <span className="hidden md:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => handleDelete('sellers', s.id)}
                              disabled={deletingId === s.id || loading}
                              className="px-2 py-1 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-600 hover:text-white rounded transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Eliminar Vendedor"
                            >
                              {deletingId === s.id ? (
                                <>
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Verificando...</span>
                                </>
                              ) : (
                                <>
                                  <Trash2 size={12} />
                                  <span className="hidden md:inline">Eliminar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Similarity Warning Modal */}
      {similarityWarning && similarityWarning.isOpen && (
        <div translate="no" className="fixed inset-0 bg-app-bg/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in no-print notranslate">
          <div className="bg-app-surface border border-app-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up text-app-text">
            <div className="border-b border-app-border p-5 flex items-start gap-3.5 bg-yellow-500/10">
              <div className="p-2.5 rounded-lg shrink-0 border bg-yellow-500/20 text-yellow-500 border-yellow-500/20">
                <Users size={20} className="stroke-[2]" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-app-text uppercase tracking-wider">
                  Registro Similar Detectado
                </h4>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5 text-yellow-500">
                  ADVERTENCIA DE DUPLICIDAD
                </p>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs leading-relaxed text-app-text/90">
                Ya existe un registro similar: <strong className="font-extrabold text-app-primary">"{similarityWarning.existingName}"</strong>.
              </p>
              <p className="text-xs leading-relaxed text-app-text/90">
                ¿Deseas continuar de todas formas o prefieres usar el existente?
              </p>
            </div>
            
            <div className="bg-app-bg/60 px-6 py-4 border-t border-app-border flex justify-end gap-3">
              <button
                onClick={() => setSimilarityWarning(null)}
                className="px-4 py-2 bg-app-surface border border-app-border hover:bg-app-bg text-app-text rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Cancelar y Usar Existente
              </button>
              <button
                onClick={similarityWarning.onConfirm}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-sm"
              >
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
