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

async function main() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();
  if (!targetEmail) {
    console.error('Uso: npx tsx scripts/set-admin-claim.ts <email>');
    process.exit(1);
  }

  console.log(`Buscando usuario en Firebase Auth: ${targetEmail}...`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(targetEmail);
  } catch (err: any) {
    console.error(`Error: Usuario no encontrado en Firebase Auth (${err?.message || err}).`);
    process.exit(1);
  }

  console.log(`Usuario encontrado. UID: ${userRecord.uid}`);
  console.log(`Asignando custom claim { admin: true }...`);
  await auth.setCustomUserClaims(userRecord.uid, { admin: true });

  // Verificar el resultado
  const updatedUser = await auth.getUser(userRecord.uid);
  if (updatedUser.customClaims?.admin === true) {
    console.log(`✓ Verificación exitosa: customClaims.admin == true para ${targetEmail} (UID: ${userRecord.uid}).`);
  } else {
    console.error(`❌ Falló la verificación de custom claims.`);
    process.exit(1);
  }

  // Sincronizar documento en Firestore users/{uid} con role: 'admin'
  try {
    const userDocRef = firestore.collection('users').doc(userRecord.uid);
    const snap = await userDocRef.get();
    if (snap.exists) {
      await userDocRef.update({
        role: 'admin',
        updatedAt: new Date().toISOString()
      });
      console.log(`✓ Documento Firestore users/${userRecord.uid} actualizado con role: 'admin'.`);
    } else {
      console.log(`ℹ Nota: No existe documento previo en Firestore para ${userRecord.uid}.`);
    }
  } catch (dbErr) {
    console.warn(`Nota: No se pudo actualizar el perfil en Firestore users/${userRecord.uid}:`, dbErr);
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
