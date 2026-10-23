import readline from 'node:readline';
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
const firestore = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore((firebaseConfig as any).firestoreDatabaseId) 
  : getFirestore();

function askPassword(): Promise<string> {
  if (process.env.ADMIN_NEW_PASSWORD) {
    return Promise.resolve(process.env.ADMIN_NEW_PASSWORD.trim());
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Ingrese la nueva contraseña del administrador (mínimo 12 caracteres): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setAdminPassword() {
  const email = 'paulcalebfs123@gmail.com';
  const newPassword = await askPassword();

  if (!newPassword || newPassword.length < 12) {
    console.error('Error: La contraseña debe tener al menos 12 caracteres.');
    process.exit(1);
  }

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

    await auth.setCustomUserClaims(user.uid, { admin: true });

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

    console.log(`✓ Contraseña del administrador actualizada exitosamente.`);
  } catch (error) {
    console.error('Error configurando contraseña de admin:', error);
    process.exit(1);
  }
}

setAdminPassword();
