import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId
  });
}

const firestore = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore((firebaseConfig as any).firestoreDatabaseId) 
  : getFirestore();

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n--- RECONCILIACIÓN DE CONTADORES ATÓMICOS (${isDryRun ? 'MODO DRY-RUN' : 'MODO EN VIVO'}) ---`);

  // 1. Reconciliar contador packingListNo
  let maxPlNum = 0;
  const plSnap = await firestore.collection('packinglists').get();
  plSnap.forEach(doc => {
    const data = doc.data();
    const plNo = data.packingListNo || data.orderNo || '';
    const match = plNo.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxPlNum) maxPlNum = num;
    }
  });

  const plCounterRef = firestore.collection('counters').doc('packingListNo');
  const plCounterSnap = await plCounterRef.get();
  const plCurrentValue = plCounterSnap.exists ? (plCounterSnap.data()?.currentValue || 0) : 0;

  console.log(`[PackingListNo] Máximo correlativo en packinglists: ${maxPlNum} | Valor actual en contador: ${plCurrentValue}`);
  if (maxPlNum > plCurrentValue) {
    if (isDryRun) {
      console.log(`[DRY-RUN] Se actualizaría el contador 'packingListNo' de ${plCurrentValue} a ${maxPlNum}.`);
    } else {
      await plCounterRef.set({
        currentValue: maxPlNum,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log(`[ACTUALIZADO] Contador 'packingListNo' establecido en ${maxPlNum}.`);
    }
  } else {
    console.log(`[OK] El contador 'packingListNo' está al día o por delante.`);
  }

  // 2. Reconciliar contador salesOrderNo (si aplica)
  let maxSoNum = 0;
  const soSnap = await firestore.collection('sales_orders').get();
  soSnap.forEach(doc => {
    const data = doc.data();
    const soNo = data.orderNo || '';
    const match = soNo.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSoNum) maxSoNum = num;
    }
  });

  const soCounterRef = firestore.collection('counters').doc('salesOrderNo');
  const soCounterSnap = await soCounterRef.get();
  const soCurrentValue = soCounterSnap.exists ? (soCounterSnap.data()?.currentValue || 0) : 0;

  console.log(`[SalesOrderNo] Máximo correlativo en sales_orders: ${maxSoNum} | Valor actual en contador: ${soCurrentValue}`);
  if (maxSoNum > soCurrentValue) {
    if (isDryRun) {
      console.log(`[DRY-RUN] Se actualizaría el contador 'salesOrderNo' de ${soCurrentValue} a ${maxSoNum}.`);
    } else {
      await soCounterRef.set({
        currentValue: maxSoNum,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log(`[ACTUALIZADO] Contador 'salesOrderNo' establecido en ${maxSoNum}.`);
    }
  } else {
    console.log(`[OK] El contador 'salesOrderNo' está al día o por delante.`);
  }

  console.log('--- RECONCILIACIÓN FINALIZADA ---\n');
}

main().catch(err => {
  console.error('Error en reconciliación de contadores:', err);
  process.exit(1);
});
