import crypto from 'node:crypto';
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

const SUPER_ADMIN_EMAIL = 'paulcalebfs123@gmail.com';

function generateSecurePassword(length = 22): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
}

function askConfirmation(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

async function main() {
  const isRotatePassword = process.argv.includes('--rotate-password');

  let existingUser: any = null;
  try {
    existingUser = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
  } catch (err: any) {
    if (err.code !== 'auth/user-not-found') {
      throw err;
    }
  }

  // 1. Si la cuenta ya existe en Firebase Auth y NO se pasó --rotate-password
  if (existingUser && !isRotatePassword) {
    console.log('La cuenta ya existe; no se modificó nada. Usa --rotate-password para rotar la contraseña.');
    process.exit(0);
  }

  // 2. Si la cuenta ya existe y se pasó --rotate-password con confirmación "ROTAR"
  if (existingUser && isRotatePassword) {
    console.log(`\nADVERTENCIA: Se solicitó rotar la contraseña del superadministrador (${SUPER_ADMIN_EMAIL}).`);
    const confirmation = await askConfirmation('Para confirmar, escribe exactamente la palabra ROTAR: ');

    if (confirmation !== 'ROTAR') {
      console.log(`Confirmación no coincide ("${confirmation}" !== "ROTAR"). Operación cancelada sin cambios.`);
      process.exit(0);
    }

    const newPassword = generateSecurePassword(22);
    console.log('Rotando contraseña en Firebase Auth...');
    await auth.updateUser(existingUser.uid, {
      password: newPassword
    });

    // Asegurar y confirmar claim admin: true
    await auth.setCustomUserClaims(existingUser.uid, { admin: true });

    // Actualizar perfil en Firestore dejando mustChangePassword: true
    await firestore.collection('users').doc(existingUser.uid).set({
      mustChangePassword: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Confirmar que el claim admin: true sigue puesto
    const verifiedUser = await auth.getUser(existingUser.uid);
    if (verifiedUser.customClaims?.admin !== true) {
      throw new Error('Falló la verificación del custom claim admin tras la rotación.');
    }

    console.log('\n=============================================================');
    console.log('         CONTRASEÑA ROTADA EXITOSAMENTE                      ');
    console.log('=============================================================');
    console.log(` Correo:              ${SUPER_ADMIN_EMAIL}`);
    console.log(` UID:                 ${existingUser.uid}`);
    console.log(` Role:                admin (Custom Claim: admin=true)`);
    console.log(` Contraseña generada: ${newPassword}`);
    console.log('-------------------------------------------------------------');
    console.log('  IMPORTANTE: Guarda esta contraseña en un lugar seguro.');
    console.log(' Solo se muestra UNA VEZ por motivos estrictos de seguridad.');
    console.log(' Al iniciar sesión, se exigirá cambiarla de inmediato.');
    console.log('=============================================================\n');
    return;
  }

  // 3. Si la cuenta no existe en Firebase Auth, crearla
  console.log(`Iniciando creación de cuenta SuperAdministrador: ${SUPER_ADMIN_EMAIL}...`);
  const generatedPassword = generateSecurePassword(22);

  const newUser = await auth.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: generatedPassword,
    displayName: 'Paul Administrador'
  });

  const uid = newUser.uid;

  // Asignar Custom Claim { admin: true }
  console.log(`Asignando Custom Claim { admin: true } a UID: ${uid}...`);
  await auth.setCustomUserClaims(uid, { admin: true });

  // Crear documento en Firestore users/{uid}
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
  console.log(`✓ Perfil de SuperAdministrador en Firestore creado en users/${uid}.`);

  // Limpiar cualquier documento legado previo que tenga el mismo email pero ID distinto
  const legacySnaps = await firestore.collection('users').where('email', '==', SUPER_ADMIN_EMAIL).get();
  for (const doc of legacySnaps.docs) {
    if (doc.id !== uid) {
      console.log(`Eliminando documento legado redundante ${doc.id}...`);
      await doc.ref.delete();
    }
  }

  // Verificar custom claim
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
