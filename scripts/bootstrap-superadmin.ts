import crypto from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const auth = getAuth();
const firestore = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore((firebaseConfig as any).firestoreDatabaseId) 
  : getFirestore();

const SUPER_ADMIN_EMAIL = 'paulcalebfs123@gmail.com';

function generateSecurePassword(length = 20): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}

async function main() {
  console.log(`Iniciando aprovisionamiento seguro de SuperAdministrador: ${SUPER_ADMIN_EMAIL}...`);

  const generatedPassword = generateSecurePassword(22);
  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
    console.log(`Usuario existente encontrado en Auth con UID: ${userRecord.uid}. Actualizando contraseña...`);
    await auth.updateUser(userRecord.uid, {
      password: generatedPassword,
      displayName: 'Paul Administrador'
    });
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      console.log(`Creando nueva cuenta en Firebase Auth...`);
      userRecord = await auth.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: generatedPassword,
        displayName: 'Paul Administrador'
      });
    } else {
      throw err;
    }
  }

  const uid = userRecord.uid;

  // 1. Asignar Custom Claim { admin: true }
  console.log(`Asignando Custom Claim { admin: true } a UID: ${uid}...`);
  await auth.setCustomUserClaims(uid, { admin: true });

  // 2. Crear / actualizar documento en Firestore users/{uid}
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

  const profileData = {
    id: uid,
    name: 'Paul Administrador',
    email: SUPER_ADMIN_EMAIL,
    role: 'admin',
    status: 'active',
    permissions: adminPermissions,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await firestore.collection('users').doc(uid).set(profileData, { merge: true });
  console.log(`✓ Perfil de SuperAdministrador en Firestore creado/actualizado en users/${uid}.`);

  // 3. Limpiar cualquier documento legado previo que tenga el mismo email pero ID distinto
  const legacySnaps = await firestore.collection('users').where('email', '==', SUPER_ADMIN_EMAIL).get();
  for (const doc of legacySnaps.docs) {
    if (doc.id !== uid) {
      console.log(`Eliminando documento legado redundante ${doc.id}...`);
      await doc.ref.delete();
    }
  }

  // 4. Verificar custom claims
  const verifiedUser = await auth.getUser(uid);
  if (verifiedUser.customClaims?.admin !== true) {
    throw new Error('Falló la verificación del custom claim admin.');
  }

  console.log('\n=============================================================');
  console.log('         SUPERADMINISTRADOR BOOTSTRAPPED EXITOSAMENTE        ');
  console.log('=============================================================');
  console.log(` Correo:              ${SUPER_ADMIN_EMAIL}`);
  console.log(` UID:                 ${uid}`);
  console.log(` Role:                admin (Custom Claim: admin=true)`);
  console.log(` Contraseña generada: ${generatedPassword}`);
  console.log('-------------------------------------------------------------');
  console.log('  IMPORTANTE: Guarda esta contraseña en un lugar seguro.');
  console.log(' Solo se muestra UNA VEZ por motivos estrictos de seguridad.');
  console.log(' Al iniciar sesión, se exigirá cambiarla de inmediato.');
  console.log('=============================================================\n');
}

main().catch((err) => {
  console.error('Error al aprovisionar superadministrador:', err);
  process.exit(1);
});
