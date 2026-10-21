import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`\n--- INICIANDO PURGA DE HASHES LEGADOS (${isDryRun ? 'MODO DRY-RUN' : 'MODO EN VIVO'}) ---`);

  const usersSnap = await firestore.collection('users').get();
  console.log(`Documentos totales en users: ${usersSnap.size}`);

  let totalWithHashes = 0;
  let totalPurged = 0;
  let totalPending = 0;
  let totalClean = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const hasHash = 'passwordHash' in data && data.passwordHash !== undefined;
    const hasSalt = 'salt' in data && data.salt !== undefined;

    if (!hasHash && !hasSalt) {
      totalClean++;
      continue;
    }

    totalWithHashes++;
    const email = (data.email || '').trim().toLowerCase();
    const docId = doc.id;

    // Verificar si el usuario ya existe en Firebase Auth (por UID o por email)
    let authUser = null;
    try {
      authUser = await auth.getUser(docId);
    } catch {
      if (email) {
        try {
          authUser = await auth.getUserByEmail(email);
        } catch {
          authUser = null;
        }
      }
    }

    if (authUser) {
      // Usuario ya existe en Firebase Auth: eliminar passwordHash y salt
      if (isDryRun) {
        console.log(`[DRY-RUN] Purga pendiente para usuario migrado: ${docId} (${email || 'sin email'})`);
      } else {
        await doc.ref.update({
          passwordHash: FieldValue.delete(),
          salt: FieldValue.delete(),
          updatedAt: new Date().toISOString()
        });
        console.log(`[PURGADO] Eliminado passwordHash y salt del usuario: ${docId} (${email})`);
      }
      totalPurged++;
    } else {
      // Usuario aún no existe en Firebase Auth: listar como pendiente de migrar sin tocarlo
      console.log(`[PENDIENTE] Usuario ${docId} (${email || 'sin email'}): pendiente de migrar a Firebase Auth (hashes conservados).`);
      totalPending++;
    }
  }

  console.log('\n================ RESUMEN DE EJECUCIÓN ================');
  console.log(`Total usuarios analizados:       ${usersSnap.size}`);
  console.log(`Usuarios ya limpios (sin hash):  ${totalClean}`);
  console.log(`Usuarios con hashes legados:     ${totalWithHashes}`);
  console.log(`  - Purgados (${isDryRun ? 'simulado' : 'realizado'}): ${totalPurged}`);
  console.log(`  - Pendientes de migración:     ${totalPending}`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Error al ejecutar purga de hashes legados:', err);
  process.exit(1);
});
