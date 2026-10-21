import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    credential: applicationDefault()
  });
}

const firestore = getFirestore();

async function seedAdmin() {
  try {
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

    await firestore.collection('users').doc('admin_paulcalebfs123').set({
      id: 'admin_paulcalebfs123',
      name: 'Super Administrador',
      email: 'paulcalebfs123@gmail.com',
      role: 'admin',
      status: 'active',
      permissions: adminPermissions,
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log('✓ Perfil de superadmin creado en Firestore correctamente.');
  } catch (err) {
    console.warn('Aviso al crear perfil de superadmin en Firestore (puede requerir credenciales de Admin SDK):', err);
  }
}

seedAdmin();
