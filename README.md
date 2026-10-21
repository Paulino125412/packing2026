# packing2026 - WMS Textil & Packing List Enterprise

Sistema integral de gestión de almacén textil, inventario de rollos por metraje, partidas y tonos, emisión de packing lists y notas de venta con sincronización Firestore y modo contingencia offline (PWA).

## Tecnologías Principales
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend**: Express, Node.js (con TSX en desarrollo y esbuild CJS en producción).
- **Base de Datos & Auth**: Google Cloud Firestore, Firebase Authentication, Firebase Admin SDK.
- **Exportación**: ExcelJS y jsPDF/html2canvas (cargados mediante importación dinámica bajo demanda).

## Seguridad y Auditoría de Dependencias

### Estado de `npm audit` y Políticas de Mantenimiento
- La ejecución de `npm audit` reporta advertencias en subdependencias transitivas (`firebase`, `@firebase/firestore`, `@grpc/grpc-js`, `exceljs`).
- El comando `npm audit fix --force` propondría una degradación mayor (downgrade) destructiva, lo cual rompería la compatibilidad con React 19 y las APIs modernas de Firestore v12.
- **Determinación técnica**: Se mantiene la versión actual y **NO se utiliza `--force`**.
- La seguridad del árbol de dependencias se audita periódicamente de manera manual y controlada.

### Control de Acceso y Criptografía
- Autenticación delegada en **Firebase Authentication** con tokens criptográficos JWT (Bearer) verificados en el backend mediante `firebase-admin`.
- Reglas de seguridad estrictas en **Firestore** con verificación obligatoria de `request.auth != null`, roles y permisos granulares por colección.
- Derivación criptográfica para hashes legados mediante **PBKDF2-HMAC-SHA256 con 600,000 iteraciones** y salt criptográfico seguro (Web Crypto API), con migración automática y eliminación de credenciales en los documentos de usuarios.
- Protección de endpoints de consulta sensible con autenticación Bearer, formato estricto y rate limiting dual (por IP con `trust proxy` y UID de usuario).

---

## Despliegue Seguro

### Permisos de la Cuenta de Servicio en Cloud Run
Cuando la aplicación se despliega en **Google Cloud Run**, el servidor utiliza de forma nativa la **Service Account predeterminada o personalizada** adjunta al servicio (utilizando Application Default Credentials). La cuenta de servicio asignada al contenedor Cloud Run requiere como mínimo los siguientes roles IAM de Google Cloud:
1. **Firebase Authentication Admin** (`roles/firebaseauth.admin`): Permite al servidor verificar tokens ID, consultar usuarios y gestionar migraciones de autenticación de forma segura.
2. **Cloud Datastore User** (`roles/datastore.user`): Permite al servidor leer y escribir documentos en la base de datos Firestore del proyecto.

### Pasos Manuales de Despliegue en Orden Estricto
1. **Habilitar Proveedor de Auth**: En la consola de Firebase, activa **Correo electrónico / Contraseña** dentro de `Authentication > Sign-in method`.
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
   *(Nota: Si una versión anterior de la app estuvo desplegada y necesitas rotar la contraseña del superadmin, ejecuta: `npx tsx scripts/bootstrap-superadmin.ts --rotate-password` escribiendo "ROTAR" por consola).*
4. **Asignación de Custom Claims**:
   Asegura el claim de administrador para el correo principal:
   ```bash
   npx tsx scripts/set-admin-claim.ts paulcalebfs123@gmail.com
   ```
5. **Reconciliación de Contadores Atómicos**:
   Verifica y actualiza los contadores de correlativos basándose en los registros existentes:
   - Primero en modo simulación:
     ```bash
     npx tsx scripts/reconcile-counters.ts --dry-run
     ```
     Luego en modo en vivo:
     ```bash
     npx tsx scripts/reconcile-counters.ts
     ```
6. **Purga de Hashes Legados**:
   Elimina los campos `passwordHash` y `salt` de los perfiles de usuario que ya migraron a Firebase Auth:
   - Primero en modo simulación:
     ```bash
     npx tsx scripts/purge-legacy-hashes.ts --dry-run
     ```
     Luego en modo en vivo:
     ```bash
     npx tsx scripts/purge-legacy-hashes.ts
     ```
7. **Auditoría de Accesos**:
   Revisa periódicamente los accesos recientes y la actividad de usuarios en la consola de Firebase Authentication.

