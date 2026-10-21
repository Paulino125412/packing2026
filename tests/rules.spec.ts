import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

test.describe('Reglas de Seguridad de Firestore (firestore.rules)', () => {
  let testEnv: RulesTestEnvironment | null = null;

  test.beforeAll(async () => {
    if (!EMULATOR_HOST) return;

    // Cargar reglas reales desde el archivo firestore.rules del proyecto
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    const hostParts = EMULATOR_HOST.split(':');
    const host = hostParts[0] || '127.0.0.1';
    const port = hostParts[1] ? parseInt(hostParts[1], 10) : 8080;

    testEnv = await initializeTestEnvironment({
      projectId: 'packing2026-rules-test',
      firestore: {
        rules,
        host,
        port
      }
    });
  });

  test.afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  test.beforeEach(async () => {
    // Si no está corriendo el emulador de Firestore, omitir automáticamente para mantener la suite en verde
    test.skip(
      !EMULATOR_HOST,
      'Omitido: Requiere el emulador de Firestore (variable FIRESTORE_EMULATOR_HOST no configurada). Ejecuta "npm run test:rules" para ejecutar con emulador.'
    );

    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // 1. Un usuario común no puede leer users/{otroUid}
  test('un usuario común no puede leer users/{otroUid}', async () => {
    if (!testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'alice'), {
        name: 'Alice User',
        email: 'alice@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: {},
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'users', 'bob'), {
        name: 'Bob User',
        email: 'bob@empresa.com',
        role: 'vendedor',
        status: 'active',
        permissions: {},
        createdAt: new Date().toISOString()
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceDb = aliceContext.firestore();

    // Alice intenta leer el documento de Bob
    await assertFails(getDoc(doc(aliceDb, 'users', 'bob')));
  });

  // 2. Un usuario común sí puede leer su propio perfil users/{uid}
  test('un usuario común sí puede leer su propio perfil users/{uid}', async () => {
    if (!testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'alice'), {
        name: 'Alice User',
        email: 'alice@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: {},
        createdAt: new Date().toISOString()
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceDb = aliceContext.firestore();

    // Alice lee su propio documento
    await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice')));
  });

  // 3. Un usuario común no puede cambiar su propio role, status ni permissions
  test('un usuario común no puede cambiar su propio role, status ni permissions', async () => {
    if (!testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'alice'), {
        name: 'Alice User',
        email: 'alice@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: { inventoryView: true },
        createdAt: new Date().toISOString()
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceDb = aliceContext.firestore();

    // Intento 1: Escalación de privilegios cambiando role a admin
    await assertFails(updateDoc(doc(aliceDb, 'users', 'alice'), {
      role: 'admin'
    }));

    // Intento 2: Reactivación o alteración de status
    await assertFails(updateDoc(doc(aliceDb, 'users', 'alice'), {
      status: 'inactive'
    }));

    // Intento 3: Modificación no autorizada de permissions
    await assertFails(updateDoc(doc(aliceDb, 'users', 'alice'), {
      permissions: { manageUsers: true, admin: true }
    }));
  });

  // 4. Los documentos con passwordHash o salt son rechazados en create y en update
  test('los documentos con passwordHash o salt son rechazados en create y en update', async () => {
    if (!testEnv) return;

    const adminContext = testEnv.authenticatedContext('superadmin', { admin: true });
    const adminDb = adminContext.firestore();

    // Create rechazado por passwordHash
    await assertFails(setDoc(doc(adminDb, 'users', 'user_with_hash'), {
      name: 'User Leak',
      email: 'leak@empresa.com',
      role: 'almacen',
      status: 'active',
      permissions: {},
      passwordHash: 'insecure_sha256_hash_123',
      createdAt: new Date().toISOString()
    }));

    // Create rechazado por salt
    await assertFails(setDoc(doc(adminDb, 'users', 'user_with_salt'), {
      name: 'User Leak Salt',
      email: 'salt@empresa.com',
      role: 'almacen',
      status: 'active',
      permissions: {},
      salt: 'insecure_salt_456',
      createdAt: new Date().toISOString()
    }));

    // Configurar usuario válido sin hash ni salt
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'valid_user'), {
        name: 'Valid User',
        email: 'valid@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: {},
        createdAt: new Date().toISOString()
      });
    });

    const userContext = testEnv.authenticatedContext('valid_user');
    const userDb = userContext.firestore();

    // Update rechazado por passwordHash
    await assertFails(updateDoc(doc(userDb, 'users', 'valid_user'), {
      passwordHash: 'hash_added_later'
    }));

    // Update rechazado por salt
    await assertFails(updateDoc(doc(userDb, 'users', 'valid_user'), {
      salt: 'salt_added_later'
    }));
  });

  // 5. Solo un admin puede crear usuarios
  test('solo un admin puede crear usuarios', async () => {
    if (!testEnv) return;

    const aliceContext = testEnv.authenticatedContext('alice');
    const aliceDb = aliceContext.firestore();

    // Usuario común no puede crear otro usuario
    await assertFails(setDoc(doc(aliceDb, 'users', 'new_user'), {
      name: 'New User',
      email: 'new@empresa.com',
      role: 'almacen',
      status: 'active',
      permissions: {},
      createdAt: new Date().toISOString()
    }));

    // Administrador autenticado sí puede crear usuario
    const adminContext = testEnv.authenticatedContext('admin_user', { admin: true });
    const adminDb = adminContext.firestore();

    await assertSucceeds(setDoc(doc(adminDb, 'users', 'new_user_by_admin'), {
      name: 'New User By Admin',
      email: 'admin_created@empresa.com',
      role: 'almacen',
      status: 'active',
      permissions: {},
      createdAt: new Date().toISOString()
    }));
  });

  // 6. Un contador no puede saltar más de +1 salvo para admin
  test('un contador no puede saltar más de +1 salvo para admin', async () => {
    if (!testEnv) return;

    // Configurar usuario no-admin con permiso packingListCreate y contador inicial en 10
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'operator'), {
        name: 'Operador Packing',
        email: 'operador@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: { packingListCreate: true },
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'counters', 'packingListNo'), {
        currentValue: 10,
        updatedAt: new Date().toISOString()
      });
    });

    const opContext = testEnv.authenticatedContext('operator');
    const opDb = opContext.firestore();

    // Incremento normal +1 (10 -> 11) permitido para el operador
    await assertSucceeds(updateDoc(doc(opDb, 'counters', 'packingListNo'), {
      currentValue: 11,
      updatedAt: new Date().toISOString()
    }));

    // Salto ilegal de más de +1 (11 -> 15) RECHAZADO para el operador
    await assertFails(updateDoc(doc(opDb, 'counters', 'packingListNo'), {
      currentValue: 15,
      updatedAt: new Date().toISOString()
    }));

    // Administrador sí puede saltar el contador (11 -> 50) para corrección o reconciliación
    const adminContext = testEnv.authenticatedContext('admin_user', { admin: true });
    const adminDb = adminContext.firestore();

    await assertSucceeds(updateDoc(doc(adminDb, 'counters', 'packingListNo'), {
      currentValue: 50,
      updatedAt: new Date().toISOString()
    }));
  });

  // 7. Un usuario sin permiso packingListCreate ni salesOrdersCreate no puede escribir contadores
  test('un usuario sin permiso packingListCreate ni salesOrdersCreate no puede escribir contadores', async () => {
    if (!testEnv) return;

    // Usuario activo sin permisos de creación
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'viewer'), {
        name: 'Lector Solo',
        email: 'viewer@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: { inventoryView: true },
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'counters', 'packingListNo'), {
        currentValue: 10,
        updatedAt: new Date().toISOString()
      });
    });

    const viewerContext = testEnv.authenticatedContext('viewer');
    const viewerDb = viewerContext.firestore();

    // Intento de actualización de contador rechazado
    await assertFails(updateDoc(doc(viewerDb, 'counters', 'packingListNo'), {
      currentValue: 11,
      updatedAt: new Date().toISOString()
    }));

    // Intento de creación de nuevo contador rechazado
    await assertFails(setDoc(doc(viewerDb, 'counters', 'unauthorizedCounter'), {
      currentValue: 1,
      updatedAt: new Date().toISOString()
    }));
  });

  // 8. Un usuario fuera del horario laboral no puede leer inventario (si ya está implementado withinWorkingHours)
  test('un usuario fuera del horario laboral no puede leer inventario (si ya está implementado withinWorkingHours)', async () => {
    if (!testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'regular_user'), {
        name: 'Usuario Turno',
        email: 'turno@empresa.com',
        role: 'almacen',
        status: 'active',
        permissions: { inventoryView: true },
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'inventory', 'roll_100'), {
        rollNumber: 'R-100',
        articleId: 'art-1',
        providerId: 'prov-1',
        initialMeters: 50,
        currentMeters: 50,
        status: 'available',
        createdAt: new Date().toISOString()
      });
    });

    const userContext = testEnv.authenticatedContext('regular_user');
    const userDb = userContext.firestore();

    // Evaluamos según la hora actual en America/Lima (UTC-5)
    const limaDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const limaHour = limaDate.getUTCHours();

    if (limaHour < 6 || limaHour >= 20) {
      // Fuera de horario laboral (20:00 - 05:59): debe denegar acceso a lectura de inventario
      await assertFails(getDoc(doc(userDb, 'inventory', 'roll_100')));
    } else {
      // Dentro de horario laboral (06:00 - 19:59): debe permitir acceso a lectura
      await assertSucceeds(getDoc(doc(userDb, 'inventory', 'roll_100')));
    }
  });
});
