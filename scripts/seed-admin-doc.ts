import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    credential: applicationDefault()
  });
}

const firestore = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore((firebaseConfig as any).firestoreDatabaseId) 
  : getFirestore();

async function seedAdmin() {
  try {
    const docRef = firestore.collection('users').doc('admin_paulcalebfs123');
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      console.log('El perfil de superadmin ya existe en Firestore. No se sobrescribió nada.');
      return;
    }

    const adminPermissions = {
      inventoryView: true,
      inventoryCreate: true,
      inventoryEdit: true,
      inventoryDelete: true,
      inventoryAdjust: true,
      packingListView: true,
      packingListCreate: true,
      packingListCancel: true,
      manageClients: true,
      manageArticles: true,
      manageProviders: true,
      manageSellers: true,
      manageUsers: true,
      salesOrdersView: true,
      salesOrdersCreate: true
    };

    await docRef.set({
      id: 'admin_paulcalebfs123',
      name: 'Super Administrador',
      email: 'paulcalebfs123@gmail.com',
      role: 'admin',
      status: 'active',
      permissions: adminPermissions,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log('✓ Perfil de superadmin creado en Firestore correctamente.');
  } catch (err) {
    console.error('Error al sembrar perfil de superadmin en Firestore:', err);
    process.exit(1);
  }
}

seedAdmin();
