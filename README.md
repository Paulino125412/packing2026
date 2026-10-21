# packing2026 - WMS Textil & Packing List Enterprise

Sistema integral de gestión de almacén textil, inventario de rollos por metraje, partidas y tonos, emisión de packing lists y notas de venta con sincronización Firestore y modo contingencia offline (PWA).

## Tecnologías Principales
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend**: Express, Node.js (con TSX en desarrollo y esbuild CJS en producción).
- **Base de Datos & Auth**: Google Cloud Firestore, Firebase Authentication, Firebase Admin SDK.
- **Exportación**: ExcelJS y jsPDF/html2canvas (cargados mediante importación dinámica bajo demanda).

## Seguridad y Auditoría de Dependencias

### Estado de `npm audit` y Políticas de Mantenimiento
- La ejecución de `npm audit` reporta 6 advertencias en subdependencias (`firebase`, `@firebase/firestore`, `@firebase/firestore-compat`, `@grpc/grpc-js`, `exceljs`, `uuid`).
- El comando `npm audit fix --force` propondría una degradación mayor (downgrade) destructiva (ej. `firebase` 12 a 9.14 y `exceljs` 4 a 3.4), lo cual rompería la compatibilidad con React 19 y las APIs modernas de Firestore v12.
- **Determinación técnica**: Se mantiene la versión actual y **NO se utiliza `--force`**.
- La seguridad del árbol de dependencias se audita periódicamente de manera manual y controlada para actualizar parches seguros compatibles con el runtime sin degradaciones mayores.

### Control de Acceso y Criptografía
- Autenticación delegada en **Firebase Authentication** con tokens criptográficos JWT (Bearer) verificados en el backend mediante `firebase-admin`.
- Reglas de seguridad estrictas en **Firestore** con verificación obligatoria de `request.auth != null`, roles y permisos granulares por colección.
- Derivación criptográfica para hashes legados mediante **PBKDF2-HMAC-SHA256 con 600,000 iteraciones** y salt criptográfico seguro (Web Crypto API), con migración automática y eliminación de credenciales en los documentos de usuarios.
- Protección de endpoints de consulta sensible (`/api/sunat/:number`) con autenticación Bearer, formato estricto y rate limiting dual (por IP con `trust proxy` y UID de usuario).
