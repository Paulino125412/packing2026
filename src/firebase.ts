import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  getDocs, 
  addDoc as firestoreAddDoc, 
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  doc, 
  setDoc,
  runTransaction as firestoreRunTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { RollItem, PackingList } from './types';

import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch (err) {
  console.warn("Failed to initialize Firestore with multi-tab offline cache, falling back to standard initialization:", err);
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({}),
      experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
  } catch (err2) {
    console.warn("Failed to initialize Firestore with single-tab offline cache, falling back to standard getFirestore:", err2);
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = dbInstance;
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Adaptive state helpers
export function getLocalMode(): boolean {
  return localStorage.getItem('texflow_local_mode') === 'true';
}

export function setLocalMode(value: boolean) {
  localStorage.setItem('texflow_local_mode', value ? 'true' : 'false');
}

// Local Storage Collections getters & setters
export function getLocalStorageCollection(collectionName: string): any[] {
  const data = localStorage.getItem(`texflow_${collectionName}`);
  return data ? JSON.parse(data) : [];
}

export function setLocalStorageCollection(collectionName: string, data: any[]) {
  localStorage.setItem(`texflow_${collectionName}`, JSON.stringify(data));
}

// Adaptive CRUD wrappers that automatically fall back to localStorage
export async function addDoc(reference: any, data: any) {
  if (getLocalMode()) {
    const path = reference.path || (reference._path ? reference._path.segments.join('/') : String(reference));
    const collectionName = path.split('/').pop() || path;
    const localData = getLocalStorageCollection(collectionName);
    
    const id = data.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem = { ...data, id };
    
    localData.push(newItem);
    setLocalStorageCollection(collectionName, localData);
    return { id, path: `${collectionName}/${id}` };
  } else {
    try {
      return await firestoreAddDoc(reference, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, reference.path || String(reference));
    }
  }
}

export async function updateDoc(reference: any, data: any) {
  if (getLocalMode()) {
    const id = reference.id;
    const path = reference.path || (reference._path ? reference._path.segments.join('/') : '');
    const segments = path.split('/');
    const collectionName = segments[segments.length - 2] || 'unknown';
    const localData = getLocalStorageCollection(collectionName);
    
    const index = localData.findIndex((item: any) => item.id === id);
    if (index !== -1) {
      localData[index] = { ...localData[index], ...data, updatedAt: new Date().toISOString() };
      setLocalStorageCollection(collectionName, localData);
    }
    return;
  } else {
    try {
      return await firestoreUpdateDoc(reference, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, reference.path || 'unknown');
    }
  }
}

export async function deleteDoc(reference: any) {
  if (getLocalMode()) {
    const id = reference.id;
    const path = reference.path || (reference._path ? reference._path.segments.join('/') : '');
    const segments = path.split('/');
    const collectionName = segments[segments.length - 2] || 'unknown';
    const localData = getLocalStorageCollection(collectionName);
    
    const updated = localData.filter((item: any) => item.id !== id);
    setLocalStorageCollection(collectionName, updated);
    return;
  } else {
    try {
      return await firestoreDeleteDoc(reference);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, reference.path || 'unknown');
      throw error;
    }
  }
}

export async function runTransaction(dbRef: any, updateFunction: (transaction: any) => Promise<any>) {
  if (getLocalMode()) {
    const localTransaction = {
      get: async (docRef: any) => {
        const id = docRef.id;
        const path = docRef.path || (docRef._path ? docRef._path.segments.join('/') : '');
        const segments = path.split('/');
        const collectionName = segments[segments.length - 2] || 'unknown';
        const localData = getLocalStorageCollection(collectionName);
        const item = localData.find((i: any) => i.id === id);
        return {
          exists: () => !!item,
          data: () => item
        };
      },
      set: (docRef: any, data: any) => {
        const id = docRef.id;
        const path = docRef.path || (docRef._path ? docRef._path.segments.join('/') : '');
        const segments = path.split('/');
        const collectionName = segments[segments.length - 2] || segments[0] || 'unknown';
        const localData = getLocalStorageCollection(collectionName);
        const index = localData.findIndex((i: any) => i.id === id);
        if (index !== -1) {
          localData[index] = { ...data };
        } else {
          localData.push({ ...data, id });
        }
        setLocalStorageCollection(collectionName, localData);
      },
      update: (docRef: any, data: any) => {
        const id = docRef.id;
        const path = docRef.path || (docRef._path ? docRef._path.segments.join('/') : '');
        const segments = path.split('/');
        const collectionName = segments[segments.length - 2] || 'unknown';
        const localData = getLocalStorageCollection(collectionName);
        const index = localData.findIndex((i: any) => i.id === id);
        if (index !== -1) {
          localData[index] = { ...localData[index], ...data, updatedAt: new Date().toISOString() };
          setLocalStorageCollection(collectionName, localData);
        }
      },
      delete: (docRef: any) => {
        const id = docRef.id;
        const path = docRef.path || (docRef._path ? docRef._path.segments.join('/') : '');
        const segments = path.split('/');
        const collectionName = segments[segments.length - 2] || 'unknown';
        const localData = getLocalStorageCollection(collectionName);
        const updated = localData.filter((i: any) => i.id !== id);
        setLocalStorageCollection(collectionName, updated);
      }
    };
    return await updateFunction(localTransaction);
  } else {
    try {
      return await firestoreRunTransaction(dbRef, updateFunction);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transaction');
      throw error;
    }
  }
}

// Seeding for Local storage
export function seedLocalStorage() {
  if (getLocalStorageCollection('providers').length === 0) {
    console.log('Seeding Local Storage with initial textile data...');
    
    const providersData = [
      { id: 'prov-texnor', name: 'Textiles del Norte S.A.', hasLot: true, hasPartida: true, hasTono: true, hasRollNo: true, createdAt: new Date().toISOString() },
      { id: 'prov-colortex', name: 'Colortex Importaciones', hasLot: true, hasPartida: false, hasTono: true, hasRollNo: true, createdAt: new Date().toISOString() },
      { id: 'prov-sudamer', name: 'Hilados Sudamericanos', hasLot: false, hasPartida: false, hasTono: false, hasRollNo: true, createdAt: new Date().toISOString() },
      { id: 'prov-milan', name: 'Sedas Milán S.A.C.', hasLot: true, hasPartida: true, hasTono: false, hasRollNo: true, createdAt: new Date().toISOString() },
    ];
    setLocalStorageCollection('providers', providersData);

    const articlesData = [
      { id: 'art-alg100', name: 'Algodón Pima 100%', description: 'Telas de algodón pima peinado de alta calidad', unit: 'metros', providerId: 'prov-texnor', createdAt: new Date().toISOString() },
      { id: 'art-lin200', name: 'Lino Rústico Premium', description: 'Lino natural prelavado de 200g/m2', unit: 'metros', providerId: 'prov-texnor', createdAt: new Date().toISOString() },
      { id: 'art-pol500', name: 'Poliéster Deportivo DryFit', description: 'Tejido transpirable para ropa deportiva', unit: 'metros', providerId: 'prov-colortex', createdAt: new Date().toISOString() },
      { id: 'art-denim12', name: 'Denim Jean 12oz Indigo', description: 'Mezclilla rígida de alta resistencia', unit: 'metros', providerId: 'prov-sudamer', createdAt: new Date().toISOString() },
      { id: 'art-seda300', name: 'Seda Satín Italiana', description: 'Seda brillante de tacto suave y caída fluida', unit: 'metros', providerId: 'prov-milan', createdAt: new Date().toISOString() },
    ];
    setLocalStorageCollection('articles', articlesData);

    const clientsData = [
      { id: 'cli-creaciones', name: 'Creaciones Modas Sofía S.A.C.', dni: '20601234567', email: 'ventas@modassofia.com', phone: '987654321', address: 'Av. Larco 456, Miraflores, Lima', createdAt: new Date().toISOString() },
      { id: 'cli-textilperu', name: 'Textiles e Confecciones Perú S.A.', dni: '20559876543', email: 'compras@textilperu.com', phone: '912345678', address: 'Jr. Gamarra 820, La Victoria, Lima', createdAt: new Date().toISOString() },
      { id: 'cli-diseno', name: 'Diseños de Vanguardia E.I.R.L.', dni: '10443322115', email: 'contacto@vanguardia.pe', phone: '955443322', address: 'Calle Las Orquídeas 120, San Isidro, Lima', createdAt: new Date().toISOString() },
    ];
    setLocalStorageCollection('clients', clientsData);

    const sellersData = [
      { id: 'sell-mario', name: 'Mario Vargas Prado', phone: '944333222', email: 'mvargas@empresa.com', createdAt: new Date().toISOString() },
      { id: 'sell-carla', name: 'Carla Mendoza Ríos', phone: '911222333', email: 'cmendoza@empresa.com', createdAt: new Date().toISOString() },
    ];
    setLocalStorageCollection('sellers', sellersData);

    const inventoryData = [
      { id: 'roll-001', rollNumber: 'R-101', articleId: 'art-alg100', providerId: 'prov-texnor', initialMeters: 100, currentMeters: 100, lot: 'LOTE-A25', partida: 'PART-01', tono: 'AZUL-MARINO-04', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'roll-002', rollNumber: 'R-102', articleId: 'art-alg100', providerId: 'prov-texnor', initialMeters: 120, currentMeters: 85, lot: 'LOTE-A25', partida: 'PART-01', tono: 'AZUL-MARINO-04', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'roll-003', rollNumber: 'R-103', articleId: 'art-lin200', providerId: 'prov-texnor', initialMeters: 80, currentMeters: 80, lot: 'LOTE-B12', partida: 'PART-05', tono: 'BEIGE-CRUDO-02', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'roll-004', rollNumber: 'R-201', articleId: 'art-pol500', providerId: 'prov-colortex', initialMeters: 150, currentMeters: 150, lot: 'LOTE-C4', partida: '', tono: 'NEGRO-DEPORTIVO', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'roll-005', rollNumber: 'R-301', articleId: 'art-denim12', providerId: 'prov-sudamer', initialMeters: 200, currentMeters: 110, lot: '', partida: '', tono: '', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'roll-006', rollNumber: 'R-401', articleId: 'art-seda300', providerId: 'prov-milan', initialMeters: 90, currentMeters: 90, lot: 'LOTE-M8', partida: 'PART-99', tono: '', status: 'available', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    setLocalStorageCollection('inventory', inventoryData);

    setLocalStorageCollection('packinglists', []);

    console.log('Local Storage successfully seeded.');
  }
}

// Full inventory & collection query helpers that bypass pagination limits
export async function fetchAllInventoryDocs(): Promise<RollItem[]> {
  if (getLocalMode()) {
    return getLocalStorageCollection('inventory') as RollItem[];
  }
  try {
    const snapshot = await getDocs(collection(db, 'inventory'));
    const list: RollItem[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as RollItem);
    });
    return list;
  } catch (error) {
    console.error("Error fetching full inventory:", error);
    return getLocalStorageCollection('inventory') as RollItem[];
  }
}

export async function findRollInInventory(rollNumber: string, articleId?: string): Promise<RollItem | null> {
  const cleanRollNum = rollNumber.trim().toLowerCase();
  if (getLocalMode()) {
    const all = getLocalStorageCollection('inventory') as RollItem[];
    return all.find(r => {
      const matchRoll = r.rollNumber?.trim().toLowerCase() === cleanRollNum;
      return articleId ? matchRoll && r.articleId === articleId : matchRoll;
    }) || null;
  }
  try {
    const snapshot = await getDocs(collection(db, 'inventory'));
    let found: RollItem | null = null;
    snapshot.forEach(docSnap => {
      const data = { ...docSnap.data(), id: docSnap.id } as RollItem;
      if (data.rollNumber?.trim().toLowerCase() === cleanRollNum) {
        if (!articleId || data.articleId === articleId) {
          found = data;
        }
      }
    });
    return found;
  } catch (error) {
    console.error("Error finding roll in inventory:", error);
    const all = getLocalStorageCollection('inventory') as RollItem[];
    return all.find(r => {
      const matchRoll = r.rollNumber?.trim().toLowerCase() === cleanRollNum;
      return articleId ? matchRoll && r.articleId === articleId : matchRoll;
    }) || null;
  }
}

export async function fetchAllSoldRolls(): Promise<RollItem[]> {
  if (getLocalMode()) {
    const all = getLocalStorageCollection('inventory') as RollItem[];
    return all.filter(r => r.currentMeters === 0 || r.status === 'sold');
  }
  try {
    const snapshot = await getDocs(collection(db, 'inventory'));
    const list: RollItem[] = [];
    snapshot.forEach(docSnap => {
      const data = { ...docSnap.data(), id: docSnap.id } as RollItem;
      if (data.currentMeters === 0 || data.status === 'sold') {
        list.push(data);
      }
    });
    return list;
  } catch (error) {
    console.error("Error fetching sold rolls:", error);
    const all = getLocalStorageCollection('inventory') as RollItem[];
    return all.filter(r => r.currentMeters === 0 || r.status === 'sold');
  }
}

export async function fetchAllPackingLists(): Promise<PackingList[]> {
  if (getLocalMode()) {
    return getLocalStorageCollection('packinglists') as PackingList[];
  }
  try {
    const snapshot = await getDocs(collection(db, 'packinglists'));
    const list: PackingList[] = [];
    snapshot.forEach(docSnap => {
      list.push({ ...docSnap.data(), id: docSnap.id } as PackingList);
    });
    return list;
  } catch (error) {
    console.error("Error fetching all packing lists:", error);
    return getLocalStorageCollection('packinglists') as PackingList[];
  }
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Seed data function to populate initial resources if database is empty
export async function seedDatabaseIfEmpty() {
  try {
    const providersCol = collection(db, 'providers');
    let providersSnapshot;
    try {
      providersSnapshot = await getDocs(providersCol);
    } catch (err: any) {
      if (err?.code === 'unavailable' || String(err).includes('offline') || String(err).includes('unavailable')) {
        console.warn('Firestore is currently in offline mode; skipping cloud seeding check.');
        return;
      }
      handleFirestoreError(err, OperationType.GET, 'providers');
      return;
    }
    
    if (providersSnapshot.empty) {
      console.log('Seeding database with initial textile data...');
      
      // 1. Seed Providers
      const providersData = [
        { id: 'prov-texnor', name: 'Textiles del Norte S.A.', hasLot: true, hasPartida: true, hasTono: true, hasRollNo: true },
        { id: 'prov-colortex', name: 'Colortex Importaciones', hasLot: true, hasPartida: false, hasTono: true, hasRollNo: true },
        { id: 'prov-sudamer', name: 'Hilados Sudamericanos', hasLot: false, hasPartida: false, hasTono: false, hasRollNo: true },
        { id: 'prov-milan', name: 'Sedas Milán S.A.C.', hasLot: true, hasPartida: true, hasTono: false, hasRollNo: true },
      ];
      
      for (const p of providersData) {
        await setDoc(doc(db, 'providers', p.id), {
          name: p.name,
          hasLot: p.hasLot,
          hasPartida: p.hasPartida,
          hasTono: p.hasTono,
          hasRollNo: p.hasRollNo,
          createdAt: new Date().toISOString()
        });
      }

      // 2. Seed Articles
      const articlesData = [
        { id: 'art-alg100', name: 'Algodón Pima 100%', description: 'Telas de algodón pima peinado de alta calidad', unit: 'metros', providerId: 'prov-texnor' },
        { id: 'art-lin200', name: 'Lino Rústico Premium', description: 'Lino natural prelavado de 200g/m2', unit: 'metros', providerId: 'prov-texnor' },
        { id: 'art-pol500', name: 'Poliéster Deportivo DryFit', description: 'Tejido transpirable para ropa deportiva', unit: 'metros', providerId: 'prov-colortex' },
        { id: 'art-denim12', name: 'Denim Jean 12oz Indigo', description: 'Mezclilla rígida de alta resistencia', unit: 'metros', providerId: 'prov-sudamer' },
        { id: 'art-seda300', name: 'Seda Satín Italiana', description: 'Seda brillante de tacto suave y caída fluida', unit: 'metros', providerId: 'prov-milan' },
      ];

      for (const a of articlesData) {
        await setDoc(doc(db, 'articles', a.id), {
          name: a.name,
          description: a.description,
          unit: a.unit,
          providerId: a.providerId,
          createdAt: new Date().toISOString()
        });
      }

      // 3. Seed Clients
      const clientsData = [
        { id: 'cli-creaciones', name: 'Creaciones Modas Sofía S.A.C.', dni: '20601234567', email: 'ventas@modassofia.com', phone: '987654321', address: 'Av. Larco 456, Miraflores, Lima' },
        { id: 'cli-textilperu', name: 'Textiles e Confecciones Perú S.A.', dni: '20559876543', email: 'compras@textilperu.com', phone: '912345678', address: 'Jr. Gamarra 820, La Victoria, Lima' },
        { id: 'cli-diseno', name: 'Diseños de Vanguardia E.I.R.L.', dni: '10443322115', email: 'contacto@vanguardia.pe', phone: '955443322', address: 'Calle Las Orquídeas 120, San Isidro, Lima' },
      ];

      for (const c of clientsData) {
        await setDoc(doc(db, 'clients', c.id), {
          name: c.name,
          dni: c.dni,
          email: c.email,
          phone: c.phone,
          address: c.address,
          createdAt: new Date().toISOString()
        });
      }

      // 4. Seed Sellers
      const sellersData = [
        { id: 'sell-mario', name: 'Mario Vargas Prado', phone: '944333222', email: 'mvargas@empresa.com' },
        { id: 'sell-carla', name: 'Carla Mendoza Ríos', phone: '911222333', email: 'cmendoza@empresa.com' },
      ];

      for (const s of sellersData) {
        await setDoc(doc(db, 'sellers', s.id), {
          name: s.name,
          phone: s.phone,
          email: s.email,
          createdAt: new Date().toISOString()
        });
      }

      // 5. Seed Roll Inventory
      const inventoryData = [
        { id: 'roll-001', rollNumber: 'R-101', articleId: 'art-alg100', providerId: 'prov-texnor', initialMeters: 100, currentMeters: 100, lot: 'LOTE-A25', partida: 'PART-01', tono: 'AZUL-MARINO-04', status: 'available' },
        { id: 'roll-002', rollNumber: 'R-102', articleId: 'art-alg100', providerId: 'prov-texnor', initialMeters: 120, currentMeters: 85, lot: 'LOTE-A25', partida: 'PART-01', tono: 'AZUL-MARINO-04', status: 'available' },
        { id: 'roll-003', rollNumber: 'R-103', articleId: 'art-lin200', providerId: 'prov-texnor', initialMeters: 80, currentMeters: 80, lot: 'LOTE-B12', partida: 'PART-05', tono: 'BEIGE-CRUDO-02', status: 'available' },
        { id: 'roll-004', rollNumber: 'R-201', articleId: 'art-pol500', providerId: 'prov-colortex', initialMeters: 150, currentMeters: 150, lot: 'LOTE-C4', partida: '', tono: 'NEGRO-DEPORTIVO', status: 'available' },
        { id: 'roll-005', rollNumber: 'R-301', articleId: 'art-denim12', providerId: 'prov-sudamer', initialMeters: 200, currentMeters: 110, lot: '', partida: '', tono: '', status: 'available' },
        { id: 'roll-006', rollNumber: 'R-401', articleId: 'art-seda300', providerId: 'prov-milan', initialMeters: 90, currentMeters: 90, lot: 'LOTE-M8', partida: 'PART-99', tono: '', status: 'available' },
      ];

      for (const r of inventoryData) {
        await setDoc(doc(db, 'inventory', r.id), {
          rollNumber: r.rollNumber,
          articleId: r.articleId,
          providerId: r.providerId,
          initialMeters: r.initialMeters,
          currentMeters: r.currentMeters,
          lot: r.lot,
          partida: r.partida,
          tono: r.tono,
          status: r.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          appVersion: '2.6r'
        });
      }
      
      console.log('Database successfully seeded.');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seeding');
  }
}

export async function syncLocalDataToCloud() {
  const collectionsToSync = ['providers', 'articles', 'clients', 'sellers', 'inventory', 'packinglists'] as const;
  const uploadedCounts = {
    providers: 0,
    articles: 0,
    clients: 0,
    sellers: 0,
    inventory: 0,
    packinglists: 0
  };

  try {
    for (const collectionName of collectionsToSync) {
      const localData = getLocalStorageCollection(collectionName);
      const itemsToSync = localData.filter((item: any) => item.id && String(item.id).startsWith('local-'));

      for (const item of itemsToSync) {
        await setDoc(doc(db, collectionName, item.id), item);
        uploadedCounts[collectionName]++;
      }
    }

    // If everything succeeded without errors, remove only synced items from localStorage
    for (const collectionName of collectionsToSync) {
      const localData = getLocalStorageCollection(collectionName);
      const remainingItems = localData.filter((item: any) => !(item.id && String(item.id).startsWith('local-')));
      setLocalStorageCollection(collectionName, remainingItems);
    }

    return {
      success: true,
      uploadedCounts
    };
  } catch (error: any) {
    const totalCount = Object.values(uploadedCounts).reduce((a, b) => a + b, 0);
    const errorMessage = `Fallo al sincronizar los datos locales. Se subieron exitosamente ${totalCount} registros antes de ocurrir el error: ${error?.message || error}`;
    console.error(errorMessage);
    return {
      success: false,
      uploadedCounts,
      error: errorMessage
    };
  }
}
