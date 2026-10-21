import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    credential: applicationDefault()
  });
}

const auth = getAuth();
const firestore = getFirestore();

async function setAdminPassword() {
  const email = 'paulcalebfs123@gmail.com';
  const newPassword = 'admin.2026';

  try {
    let user;
    try {
      user = await auth.getUserByEmail(email);
      console.log(`Usuario encontrado con UID: ${user.uid}. Actualizando contraseña...`);
      await auth.updateUser(user.uid, {
        password: newPassword,
        displayName: 'Super Administrador'
      });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        console.log(`Usuario no encontrado en Firebase Auth. Creando nuevo usuario...`);
        user = await auth.createUser({
          email,
          password: newPassword,
          displayName: 'Super Administrador'
        });
        console.log(`Usuario creado con UID: ${user.uid}`);
      } else {
        throw err;
      }
    }

    // Set custom claims admin: true
    await auth.setCustomUserClaims(user.uid, { admin: true });

    // Ensure Firestore profile exists and is active with role admin
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

    await firestore.collection('users').doc(user.uid).set({
      id: user.uid,
      name: 'Super Administrador',
      email,
      role: 'admin',
      status: 'active',
      permissions: adminPermissions,
      mustChangePassword: false,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`✓ Contraseña del administrador configurada exitosamente a: ${newPassword}`);
  } catch (error) {
    console.error('Error configurando contraseña de admin:', error);
    process.exit(1);
  }
}

setAdminPassword();
