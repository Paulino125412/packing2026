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

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n--- RECONCILIACIÓN DE CONTADORES ATÓMICOS (${isDryRun ? 'MODO DRY-RUN' : 'MODO EN VIVO'}) ---`);

  let maxPlNum = 0;
  let validDocumentsCount = 0;
  let ignoredDocumentsCount = 0;

  // 1. Consultar todos los documentos de packinglists
  const plSnap = await firestore.collection('packinglists').get();
  plSnap.forEach(doc => {
    const data = doc.data();
    const plNo = typeof data.packingListNo === 'string' ? data.packingListNo.trim() : '';

    // Formato estricto: PL-#### (ej. PL-0001, PL-0005). Se ignoran ROLLO-DIRECT-*, OV-PRUEBA-*, etc.
    const match = plNo.match(/^PL-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        validDocumentsCount++;
        if (num > maxPlNum) {
          maxPlNum = num;
        }
      } else {
        ignoredDocumentsCount++;
      }
    } else {
      ignoredDocumentsCount++;
    }
  });

  // 2. Consultar valor actual en colección counters/packingListNo
  const plCounterRef = firestore.collection('counters').doc('packingListNo');
  const plCounterSnap = await plCounterRef.get();
  const plCurrentValueBefore = plCounterSnap.exists ? (Number(plCounterSnap.data()?.currentValue) || 0) : 0;
  let plCurrentValueAfter = plCurrentValueBefore;

  console.log(`\nDocumentos analizados en 'packinglists': ${plSnap.size}`);
  console.log(`- Documentos con correlativo válido PL-####: ${validDocumentsCount}`);
  console.log(`- Documentos ignorados por formato: ${ignoredDocumentsCount}`);
  console.log(`- Máximo correlativo encontrado: ${maxPlNum}`);
  console.log(`- Valor del contador antes: ${plCurrentValueBefore}`);

  // 3. Solo subir el contador si el máximo existente es estrictamente mayor; nunca bajarlo
  if (maxPlNum > plCurrentValueBefore) {
    if (isDryRun) {
      plCurrentValueAfter = maxPlNum;
      console.log(`[DRY-RUN] Se actualizaría el contador 'packingListNo' de ${plCurrentValueBefore} a ${maxPlNum}.`);
    } else {
      await plCounterRef.set({
        currentValue: maxPlNum,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      plCurrentValueAfter = maxPlNum;
      console.log(`[ACTUALIZADO] Contador 'packingListNo' actualizado de ${plCurrentValueBefore} a ${maxPlNum}.`);
    }
  } else {
    console.log(`[OK] El contador 'packingListNo' está al día o por delante (${plCurrentValueBefore} >= ${maxPlNum}). No se requieren cambios.`);
  }

  // 4. Resumen final requerido
  console.log('\n=============================================================');
  console.log('             RESUMEN DE RECONCILIACIÓN DE CONTADORES        ');
  console.log('=============================================================');
  console.log(` Contador:                   packingListNo`);
  console.log(` Máximo encontrado:          ${maxPlNum}`);
  console.log(` Valor del contador antes:   ${plCurrentValueBefore}`);
  console.log(` Valor del contador después: ${plCurrentValueAfter}${isDryRun && maxPlNum > plCurrentValueBefore ? ' (Simulado)' : ''}`);
  console.log(` Documentos ignorados:       ${ignoredDocumentsCount}`);
  console.log(` Modo de ejecución:          ${isDryRun ? 'DRY-RUN (Sin escrituras)' : 'EN VIVO'}`);
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('Error en reconciliación de contadores:', err);
  process.exit(1);
});
