# packing2026 - WMS Textil & Packing List Enterprise

Sistema integral de gestión de almacén textil, inventario de rollos por metraje, partidas y tonos, emisión de packing lists y notas de venta con sincronización Firestore y modo contingencia offline (PWA).

## Tecnologías Principales
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend**: Express, Node.js (con TSX en desarrollo y compilación esbuild CJS en producción).
- **Base de Datos & Auth**: Google Cloud Firestore (base de datos con nombre vía `firestoreDatabaseId`), Firebase Authentication, Firebase Admin SDK.
- **Exportación**: ExcelJS y jsPDF/html2canvas (cargados mediante importación dinámica bajo demanda).
- **Pruebas**: Playwright Test Suite y `@firebase/rules-unit-testing`.

---

## Seguridad y Control de Acceso

### Estado de `npm audit` y Políticas de Mantenimiento
- La ejecución de `npm audit` reporta advertencias en subdependencias transitivas (`firebase`, `@firebase/firestore`, `@grpc/grpc-js`, `exceljs`).
- El comando `npm audit fix --force` propondría una degradación mayor (downgrade) destructiva, lo cual rompería la compatibilidad con React 19 y las APIs modernas de Firestore v12.
- **Determinación técnica**: Se mantiene la versión actual y **NO se utiliza `--force`**. La seguridad del árbol de dependencias se audita periódicamente de manera manual y controlada.

### Autenticación y Tokens Criptográficos
- Autenticación delegada en **Firebase Authentication** con tokens criptográficos JWT (Bearer) verificados en el backend (`requireFirebaseAuth` en `server.ts`) mediante `firebase-admin/auth` con verificación estricta de revocación (`verifyIdToken(idToken, true)`).
- En caso de token inválido o revocado, el backend responde con un error genérico `401 Unauthorized` (`"Token de autenticación inválido o vencido."`), registrando el detalle técnico exclusivamente en `console.error` del servidor para prevenir fuga de metadatos o URLs de Firebase.

### Reglas de Seguridad en Firestore (`firestore.rules`)
- Verificación obligatoria de `isAuthenticated()` y cuenta activa (`status == 'active'`).
- Control de acceso basado en roles (RBAC) con permisos granulares por colección.
- Protección estricta del documento de usuario (`users/{userId}`):
  - Los usuarios comunes solo pueden leer su propio documento y no pueden leer documentos de otros usuarios (`users/{otroUid}`).
  - Los usuarios comunes no pueden modificar su propio `role`, `status`, `permissions` ni `email`.
  - Solo un administrador (`isAdmin()`) puede crear o eliminar usuarios.
  - Se prohíbe de manera absoluta la existencia o escritura de campos `passwordHash` y `salt` tanto en `create` como en `update`.

### Horario Laboral en Servidor y Reglas
- **Franja horaria**: 06:00 a 19:59 (hora de Lima, `America/Lima`).
- **Zona horaria**: Lima (Perú) se encuentra en **UTC-5 todo el año y no utiliza horario de verano** (Daylight Saving Time / DST). El offset constante es de -5 horas (-18,000,000 milisegundos).
- **En servidor (`server.ts`)**: En `requireFirebaseAuth`, tras verificar que el usuario está activo, si NO es admin (sin claim `admin` ni role `admin`), se calcula la hora en Lima mediante `new Date(Date.now() - 5 * 3600000).getUTCHours()`. Fuera del rango 06:00-19:59 responde `403 Forbidden` (`"Acceso fuera del horario permitido."`).
- **En reglas (`firestore.rules`)**: La función `withinWorkingHours()` evalúa `timestamp.value(request.time.toMillis() - 18000000).hours() >= 6 && timestamp.value(request.time.toMillis() - 18000000).hours() < 20`, integrada en `isUserActive()` de modo que los administradores quedan exentos y los usuarios estándar no pueden leer ni escribir colecciones fuera del horario permitido.
- **En cliente (`AuthContext.tsx` y `App.tsx`)**: Muestra un mensaje amigable en el formulario de login y cierra automáticamente la sesión con una notificación visual a las 8:00 PM.

### Límites de Tamaño de Payload (Anti-DoS)
- **JSON global**: Límite estricto de **100kb** (`express.json({ limit: '100kb' })`) con middleware explícito que responde `413 Payload Too Large` ante cargas sobredimensionadas y `400 Bad Request` ante JSON malformado.
- **Sentry Tunnel**: Límite estricto de **200kb** en `/api/sentry-tunnel` (`express.raw({ limit: '200kb' })`) con rate limiting de 60 req/min por IP.

### Orden de Validación en Migración Legada (`/api/auth/migrate-legacy`)
El endpoint de migración perezosa de cuentas legadas ejecuta las validaciones en el siguiente orden estricto:
1. **Validación de body (400 Bad Request)**: Comprueba que `email` y `password` existan y sean strings válidos.
2. **Rate limiting dual (429 Too Many Requests)**:
   - Máximo 10 intentos por minuto por IP (`trust proxy`).
   - Máximo 5 intentos por minuto por correo electrónico.
3. **Disponibilidad de Firebase Admin (503 Service Unavailable)**: Evalúa `await ensureAdminReady()` (con caché de éxito y cooldown de 30 segundos ante fallos de credenciales ADC). Si no está disponible, responde con mensaje genérico `"Servicio de autenticación no disponible temporalmente."`.
4. **Acceso al Admin SDK y verificación criptográfica**:
   - Consulta el documento del usuario en Firestore por email.
   - Verifica la contraseña contra el hash legado (`PBKDF2-HMAC-SHA256` o `SHA-256`) mediante comparación en tiempo constante (`timingSafeEqual`).
   - Si la cuenta ya existe en Firebase Auth, responde `409 Conflict`.
   - Crea el usuario en Firebase Auth, asigna custom claims (`admin: true` si corresponde) y actualiza el documento en Firestore eliminando permanentemente `passwordHash` y `salt`.

### Comportamiento del Contador Atómico de Packing Lists
- **Detección de desfase**: Dentro de la transacción atómica en `PackingListForm.tsx`, se consulta el contador `counters/packingListNo` y se calcula `maxExistingNum` de los packing lists existentes (`/^PL-(\d+)$/i`).
- Si `maxExistingNum >= currentVal` (o si el documento contador no existe pero ya hay packing lists registrados con `maxExistingNum > 0`), la transacción aborta inmediatamente con el error `"El contador está desfasado, avisa al administrador"`.
- No se crea el packing list ni se modifican rollos de inventario. El mensaje se muestra visiblemente al usuario mediante un `AlertBanner` de error y una notificación emergente `toast.error`.
- **Corrección**: Para corregir el desfase, el administrador ejecuta `scripts/reconcile-counters.ts`. En `firestore.rules`, los administradores (`isAdmin()`) tienen permitido actualizar `currentValue >= resource.data.currentValue` sin el límite de incremento `+1` que rige para los demás usuarios.

---

## Suite de Pruebas

### Pruebas de Aplicación y API
Ejecuta la suite de pruebas unitarias, parsers numéricos y seguridad de API en Playwright:
```bash
npx playwright test --project=chromium --grep-invert "página principal"
```

### Pruebas de Reglas de Seguridad (`tests/rules.spec.ts`)
Las pruebas de reglas unitarias utilizan `@firebase/rules-unit-testing` y cargan directamente el archivo `firestore.rules` del proyecto:
- Si no está presente la variable `FIRESTORE_EMULATOR_HOST`, los tests se omiten automáticamente con `test.skip` para mantener la suite general en verde.
- Para ejecutar las pruebas contra el emulador local de Firestore:
  ```bash
  npm run test:rules
  ```
  *(Equivalente a: `firebase emulators:exec --only firestore "npx playwright test tests/rules.spec.ts --project=chromium"`)*

Casos cubiertos en la suite de reglas:
1. Un usuario común no puede leer `users/{otroUid}`.
2. Un usuario común sí puede leer su propio perfil `users/{uid}`.
3. Un usuario común no puede cambiar su propio `role`, `status` ni `permissions`.
4. Los documentos con `passwordHash` o `salt` son rechazados en `create` y en `update`.
5. Solo un admin puede crear usuarios.
6. Un contador no puede saltar más de +1 salvo para admin.
7. Un usuario sin permiso `packingListCreate` ni `salesOrdersCreate` no puede escribir contadores.
8. Un usuario fuera del horario laboral no puede leer inventario (`withinWorkingHours`).

---

## Despliegue Seguro

### Permisos de la Cuenta de Servicio en Cloud Run
Cuando la aplicación se despliega en **Google Cloud Run**, el servidor utiliza de forma nativa la **Service Account predeterminada o personalizada** adjunta al servicio (utilizando Application Default Credentials). La cuenta de servicio asignada al contenedor Cloud Run requiere como mínimo los siguientes roles IAM de Google Cloud:
1. **Firebase Authentication Admin** (`roles/firebaseauth.admin`): Permite al servidor verificar tokens ID, consultar usuarios y gestionar migraciones de autenticación de forma segura.
2. **Cloud Datastore User** (`roles/datastore.user`): Permite al servidor leer y escribir documentos en la base de datos Firestore del proyecto.

### Base de Datos con Nombre (`firestoreDatabaseId`)
La aplicación y todos sus scripts de administración se conectan a la base de datos Firestore especificada en `firebase-applet-config.json` (`firestoreDatabaseId: "ai-studio-remixpackinglist-393e19a7-b257-4d39-9f22-eb21be62160c"`).

### Pasos Manuales de Despliegue en Orden Estricto

> **NOTA CRÍTICA DE MIGRACIÓN Y SEGURIDAD:**
> Si una versión anterior a `110d240` estuvo desplegada, rota primero la contraseña del administrador con `bootstrap-superadmin.ts --rotate-password` (escribiendo "ROTAR" cuando lo solicite la consola) y revisa los accesos recientes en la consola de Firebase Authentication antes de continuar.

1. **Habilitar Proveedor de Auth**:
   En la consola de Firebase, activa el proveedor **Correo electrónico / Contraseña** dentro de `Authentication > Sign-in method`.

2. **Despliegue de Reglas de Firestore**:
   Sube las reglas de seguridad al proyecto de Firebase:
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Bootstrap del Superadministrador**:
   Ejecuta el script para inicializar la cuenta del superadministrador principal (imprimirá la contraseña segura generada una única vez):
   ```bash
   npx tsx scripts/bootstrap-superadmin.ts
   ```
   *Para rotación deliberada de contraseña de una cuenta existente:*
   ```bash
   npx tsx scripts/bootstrap-superadmin.ts --rotate-password
   ```
   *(El script solicitará confirmación escribiendo la palabra `ROTAR` de forma exacta antes de proceder).*

4. **Asignación de Custom Claims**:
   Asegura el claim de administrador en Firebase Auth para el correo principal:
   ```bash
   npx tsx scripts/set-admin-claim.ts paulcalebfs123@gmail.com
   ```

5. **Reconciliación de Contadores Atómicos**:
   Verifica y actualiza el contador `packingListNo` basándose en los registros existentes con formato estricto `PL-####` (ignora automáticamente registros con prefijos `ROLLO-DIRECT-*`, `OV-PRUEBA-*`, etc.):
   - Primero en modo simulación:
     ```bash
     npx tsx scripts/reconcile-counters.ts --dry-run
     ```
   - Luego en modo en vivo:
     ```bash
     npx tsx scripts/reconcile-counters.ts
     ```

6. **Purga de Hashes Legados**:
   Elimina los campos `passwordHash` y `salt` de los perfiles de usuario en Firestore que ya migraron a Firebase Auth:
   - Primero en modo simulación:
     ```bash
     npx tsx scripts/purge-legacy-hashes.ts --dry-run
     ```
   - Luego en modo en vivo:
     ```bash
     npx tsx scripts/purge-legacy-hashes.ts
     ```

7. **Auditoría de Accesos**:
   Revisa periódicamente los accesos recientes y la actividad de usuarios en la consola de Firebase Authentication.
