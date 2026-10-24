import express from "express";
import path from "path";
import crypto from "node:crypto";
import { createServer as createViteServer } from "vite";
import { initializeApp as initAdminApp, getApps as getAdminApps, applicationDefault } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

const app = express();
const PORT = 3000;

// Trust proxy configuration for Cloud Run / reverse proxies so req.ip is the real client IP
app.set('trust proxy', 1);

// Initialize Firebase Admin SDK for server-side token verification
if (!getAdminApps().length) {
  initAdminApp({
    projectId: firebaseConfig.projectId,
    credential: applicationDefault()
  });
}

// Sentry Tunnel Route: Bypasses browser AdBlockers and Brave Shields.
// MUST be defined before global express.json() so express.raw receives the raw unparsed stream.
const sentryRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const SENTRY_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const SENTRY_RATE_LIMIT_MAX = 60; // 60 requests / minute

app.post("/api/sentry-tunnel", express.raw({ type: "*/*", limit: "200kb" }), async (req, res) => {
  try {
    // 1. Rate Limiting by IP (max 60 requests/min, response 429)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let rateRecord = sentryRateLimitMap.get(clientIp);

    if (!rateRecord || now > rateRecord.resetTime) {
      rateRecord = { count: 1, resetTime: now + SENTRY_RATE_LIMIT_WINDOW };
      sentryRateLimitMap.set(clientIp, rateRecord);
    } else {
      rateRecord.count++;
      if (rateRecord.count > SENTRY_RATE_LIMIT_MAX) {
        return res.status(429).json({ error: "Too many requests to Sentry tunnel. Rate limit exceeded (60 req/min)." });
      }
    }

    // Periodic cleanup of expired rate limit entries to prevent memory leaks
    if (sentryRateLimitMap.size > 500) {
      for (const [key, value] of sentryRateLimitMap.entries()) {
        if (now > value.resetTime) {
          sentryRateLimitMap.delete(key);
        }
      }
    }

    let rawEnvelope = "";
    let envelopeBuffer: Buffer;

    if (Buffer.isBuffer(req.body)) {
      envelopeBuffer = req.body;
      rawEnvelope = req.body.toString("utf8");
    } else if (typeof req.body === "string") {
      rawEnvelope = req.body;
      envelopeBuffer = Buffer.from(req.body, "utf8");
    } else if (req.body && typeof req.body === "object") {
      rawEnvelope = JSON.stringify(req.body);
      envelopeBuffer = Buffer.from(rawEnvelope, "utf8");
    } else {
      return res.status(400).json({ error: "Empty or invalid envelope payload" });
    }

    if (!rawEnvelope || rawEnvelope.trim() === "") {
      return res.status(400).json({ error: "Empty envelope" });
    }

    const firstLine = rawEnvelope.split("\n")[0].trim();
    let header: any = {};
    try {
      header = JSON.parse(firstLine);
    } catch {
      if (req.body && typeof req.body === "object") {
        header = req.body;
      }
    }

    // 2. Validate server-configured DSN
    const serverConfiguredDsn = process.env.VITE_SENTRY_DSN;
    if (!serverConfiguredDsn) {
      return res.status(204).end();
    }

    // 3. Validate that envelope's DSN matches server's configured DSN
    if (header?.dsn) {
      try {
        const headerUrl = new URL(header.dsn);
        const configuredUrl = new URL(serverConfiguredDsn);
        if (headerUrl.toString() !== configuredUrl.toString()) {
          return res.status(400).json({ error: "Envelope DSN does not match configured server DSN" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid envelope DSN" });
      }
    }

    let dsn: URL;
    try {
      dsn = new URL(serverConfiguredDsn);
    } catch {
      return res.status(400).json({ error: "Invalid configured Sentry DSN" });
    }

    if (!dsn.hostname.endsWith(".sentry.io")) {
      return res.status(403).json({ error: "Invalid DSN host" });
    }

    const projectId = dsn.pathname.replace(/^\//, "");
    const sentryUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`;

    const response = await fetch(sentryUrl, {
      method: "POST",
      body: envelopeBuffer,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
      },
    });

    const responseText = await response.text();
    res.status(response.status).send(responseText);
  } catch (e: any) {
    console.error("Error en Sentry Tunnel:", e?.message || e);
    res.status(500).json({ error: e?.message || "Tunnel error" });
  }
});

// Global JSON parser limited to 100kb to protect against large payload DoS
app.use(express.json({ limit: '100kb' }));

// Explicit JSON body-parser error handler for 413 Payload Too Large and 400 Bad Request
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({ error: 'Payload Too Large', message: 'El cuerpo de la solicitud excede el límite permitido (100kb).' });
  }
  if (err && (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400)) {
    return res.status(400).json({ error: 'Bad Request', message: 'JSON malformado en la solicitud.' });
  }
  next(err);
});

// Standard health check route for container & proxy readiness
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Constant-time hex comparison
function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Server-side legacy password hash verification (PBKDF2 and legacy SHA-256)
function verifyServerLegacyPassword(password: string, salt: string, storedHash: string): boolean {
  if (!password || !salt || !storedHash) return false;

  // PBKDF2 Format: pbkdf2:<iterations>:<salt>:<hexHash>
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10);
      const saltFromHash = parts[2];
      const targetHash = parts[3];
      if (!iterations || !saltFromHash || !targetHash) return false;

      const derived = crypto.pbkdf2Sync(password, saltFromHash, iterations, 32, 'sha256').toString('hex');
      return safeEqualHex(derived, targetHash);
    }
  }

  // Legacy SHA-256 combinations
  const c1 = crypto.createHash('sha256').update(salt + password).digest('hex');
  if (safeEqualHex(c1, storedHash)) return true;

  const c2 = crypto.createHash('sha256').update(password + salt).digest('hex');
  if (safeEqualHex(c2, storedHash)) return true;

  const c3 = crypto.createHash('sha256').update(password).digest('hex');
  if (safeEqualHex(c3, storedHash)) return true;

  return false;
}


// Global error handlers to prevent unhandled gRPC or promise rejections from crashing the server
process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  const msg = String(err?.message || err || '');
  console.error('Uncaught Exception:', msg, err?.stack || '');

  if (
    msg.includes('Could not load the default credentials') ||
    msg.includes('google-gax') ||
    msg.includes('grpc')
  ) {
    // Solo registrar y seguir vivo ante errores transitorios de credenciales/transporte de Google
    return;
  }

  // Para cualquier otra excepción, terminar para reinicio limpio del hosting
  process.exit(1);
});

// Admin SDK readiness check with dynamic retry & 30s cache
let adminReadyCache = false;
let lastAdminCheckTime = 0;
const ADMIN_CHECK_COOLDOWN_MS = 30 * 1000; // 30 seconds

async function ensureAdminReady(): Promise<boolean> {
  // 1. Si ya hubo un éxito, devuelve true desde caché
  if (adminReadyCache) {
    return true;
  }

  const now = Date.now();
  // 2. Si el último intento falló hace menos de 30 segundos, devuelve false sin reintentar
  if (lastAdminCheckTime > 0 && (now - lastAdminCheckTime) < ADMIN_CHECK_COOLDOWN_MS) {
    return false;
  }

  // 3. Si pasaron más de 30 segundos (o es el primer intento), vuelve a verificar con applicationDefault().getAccessToken()
  lastAdminCheckTime = now;
  try {
    const defaultAppCreds = applicationDefault();
    await defaultAppCreds.getAccessToken();
    adminReadyCache = true;
    console.log('✓ Firebase Admin SDK credenciales verificadas correctamente.');
    return true;
  } catch (err: any) {
    console.warn('⚠️ ADVERTENCIA: No se pudieron obtener las credenciales de Firebase Admin (ADC).');
    console.warn('Detalle:', err?.message || err);
    console.warn('Asegúrate de configurar GOOGLE_APPLICATION_CREDENTIALS o la service account del hosting.');
    console.warn('Los endpoints protegidos de autenticación responderán 503 hasta que se configuren las credenciales.');
    adminReadyCache = false;
    return false;
  }
}

// Verificación inicial no bloqueante al arrancar el servidor
ensureAdminReady().catch((err) => {
  console.warn('Error en verificación inicial de credenciales:', err?.message || err);
});

// Lazy Account Migration Route: Bridges legacy password hashes to Firebase Auth securely
const migrationRateLimitIpMap = new Map<string, { count: number; resetTime: number }>();
const migrationRateLimitEmailMap = new Map<string, { count: number; resetTime: number }>();

// Helper to get Admin Firestore instance
function getDb() {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  return dbId ? getAdminFirestore(dbId) : getAdminFirestore();
}

app.post("/api/auth/migrate-legacy", async (req, res) => {
  // (a) Validar body
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Correo y contraseña requeridos.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  // (b) Rate limit por IP y por correo
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const ipKey = `mig-ip:${clientIp}`;
  let ipRecord = migrationRateLimitIpMap.get(ipKey);
  if (!ipRecord || now > ipRecord.resetTime) {
    ipRecord = { count: 1, resetTime: now + 60000 };
    migrationRateLimitIpMap.set(ipKey, ipRecord);
  } else {
    ipRecord.count++;
    if (ipRecord.count > 10) {
      return res.status(429).json({ 
        success: false, 
        message: 'Demasiados intentos de verificación. Inténtalo de nuevo en 1 minuto.' 
      });
    }
  }

  const emailKey = `mig-email:${cleanEmail}`;
  let emailRecord = migrationRateLimitEmailMap.get(emailKey);
  if (!emailRecord || now > emailRecord.resetTime) {
    emailRecord = { count: 1, resetTime: now + 60000 };
    migrationRateLimitEmailMap.set(emailKey, emailRecord);
  } else {
    emailRecord.count++;
    if (emailRecord.count > 5) {
      return res.status(429).json({ 
        success: false, 
        message: 'Demasiados intentos de verificación para esta cuenta. Inténtalo de nuevo en 1 minuto.' 
      });
    }
  }

  // (c) Chequeo de ensureAdminReady (503 genérico)
  const isReady = await ensureAdminReady();
  if (!isReady) {
    return res.status(503).json({
      success: false,
      message: 'Servicio de autenticación no disponible temporalmente.'
    });
  }

  // (d) Acceso al Admin SDK
  try {
    const firestore = getDb();
    const adminAuth = getAdminAuth();

    // 2. Search for legacy user in Firestore
    let usersSnap;
    try {
      usersSnap = await firestore.collection('users').where('email', '==', cleanEmail).get();
    } catch (fsErr: any) {
      if (fsErr?.code === 7 || fsErr?.message?.includes('PERMISSION_DENIED') || fsErr?.message?.includes('insufficient permissions')) {
        console.error('A la service account le falta el rol "Cloud Datastore User":', fsErr?.message || fsErr);
      } else {
        console.warn('Firestore query error in migrate-legacy:', fsErr?.message || fsErr);
      }
      return res.status(503).json({
        success: false,
        message: 'Servicio de autenticación no disponible temporalmente (Permisos de base de datos).'
      });
    }

    if (usersSnap.empty) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas o cuenta no registrada.' 
      });
    }

    const legacyDoc = usersSnap.docs[0];
    const userDoc = legacyDoc.data();
    const oldDocId = legacyDoc.id;

    // Must have stored passwordHash and salt
    if (!userDoc || !userDoc.passwordHash || !userDoc.salt) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas o cuenta no registrada.' 
      });
    }

    const passwordValid = verifyServerLegacyPassword(cleanPassword, userDoc.salt, userDoc.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas o cuenta no registrada.' 
      });
    }

    // 3. Only emit 409 Conflict if legacy credentials were successfully verified AND account already exists in Firebase Auth
    try {
      await adminAuth.getUserByEmail(cleanEmail);
      return res.status(409).json({
        success: false,
        message: 'La cuenta ya ha sido migrada a Firebase Auth. Inicie sesión directamente con su correo y contraseña.'
      });
    } catch (authLookupErr: any) {
      if (authLookupErr.code !== 'auth/user-not-found') {
        console.error('Error al verificar cuenta en Firebase Auth:', authLookupErr);
        return res.status(500).json({
          success: false,
          message: 'Error del servidor durante la migración de cuenta.'
        });
      }
      // user-not-found is expected: proceed to create in Firebase Auth
    }

    // 4. Create brand new account in Firebase Auth (no updateUser)
    const fbUser = await adminAuth.createUser({
      email: cleanEmail,
      password: cleanPassword,
      displayName: userDoc.name || 'Usuario'
    });

    const targetUid = fbUser.uid;

    // If role is admin, assign admin custom claim
    if (userDoc.role === 'admin') {
      try {
        await adminAuth.setCustomUserClaims(targetUid, { admin: true });
      } catch (claimErr) {
        console.error('Error al asignar custom claim admin en migración:', claimErr);
      }
    }

    // 5. Determine mustChangePassword per requirement 5
    const mustChangePasswordValue = userDoc.mustChangePassword === true || cleanPassword === 'admin123';

    // 6. Create / merge Firestore user profile keyed by UID without passwordHash or salt
    const profileData: Record<string, any> = {
      id: targetUid,
      name: userDoc.name || 'Usuario',
      email: cleanEmail,
      role: userDoc.role || 'custom',
      status: userDoc.status || 'active',
      permissions: userDoc.permissions || {},
      mustChangePassword: mustChangePasswordValue,
      createdAt: userDoc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await firestore.collection('users').doc(targetUid).set(profileData, { merge: true });

    // Clean up old legacy doc if document ID was different from the new UID
    if (oldDocId && oldDocId !== targetUid) {
      try {
        await firestore.collection('users').doc(oldDocId).delete();
      } catch (delErr) {
        console.warn('Error eliminando documento legado antiguo:', delErr);
      }
    }

    return res.json({ success: true, migrated: true });
  } catch (err: any) {
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('insufficient permissions')) {
      console.error('A la service account le falta el rol "Cloud Datastore User":', err?.message || err);
    } else {
      console.error('Error in /api/auth/migrate-legacy:', err);
    }
    if (err?.code === 7 || err?.code === 5 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('insufficient permissions') || err?.message?.includes('NOT_FOUND')) {
      return res.status(503).json({
        success: false,
        message: 'Servicio de autenticación no disponible temporalmente.'
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'Error del servidor durante la migración de cuenta.' 
    });
  }
});

// In-memory cache for fast repeat lookups
const lookupCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Safe JSON Fetcher with user agents & timeout
async function fetchJsonSafe(url: string, headers: Record<string, string> = {}): Promise<any> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Safe HTML Fetcher for SUNAT Portal Scraping
async function fetchHtmlSafe(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// Helper to extract clean full name from any DNI API response structure
function extractDniName(data: any): string | null {
  if (!data) return null;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item) return null;
  const t = item.data || item.result || item.payload || item.response || item;

  // Pattern 1: Separate names and surnames
  const first = t.nombres || t.nombre || t.first_name || t.given_name || t.FirstName || '';
  const pat = t.apellidoPaterno || t.apellido_paterno || t.paterno || t.last_name || t.paternal_surname || t.PaternalSurname || '';
  const mat = t.apellidoMaterno || t.apellido_materno || t.materno || t.maternal_surname || t.MaternalSurname || '';

  if (first && (pat || mat)) {
    const full = `${String(first).trim()} ${String(pat).trim()} ${String(mat).trim()}`.trim();
    if (full.length > 3) return full;
  }

  if (t.nombres && t.apellidos) {
    const full = `${String(t.nombres).trim()} ${String(t.apellidos).trim()}`.trim();
    if (full.length > 3) return full;
  }

  // Pattern 2: Single name string fields
  const single = t.nombre_completo || t.full_name || t.nombres_completos || t.razonSocial || t.nombre || t.resultado || t.cliente || t.ciudadano || t.FullName;
  if (single && typeof single === 'string' && single.trim().length > 3) {
    return single.trim();
  }

  return null;
}

// Scrape eldni.com for Peruvian DNI names
async function scrapeElDni(cleanDni: string): Promise<string | null> {
  try {
    const url = `https://eldni.com/pe/buscar-por-dni?dni=${cleanDni}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();

    const matches = html.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (matches && matches.length >= 3) {
      const texts = matches.map(m => m.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      const filtered = texts.filter(t => 
        !['dni', 'nombres', 'apellido paterno', 'apellido materno', 'buscar', 'resultado', 'acción', 'opciones'].includes(t.toLowerCase()) &&
        !t.match(/^\d{8}$/) &&
        t.length > 1
      );
      if (filtered.length >= 2) {
        return filtered.slice(0, 3).join(' ');
      }
    }
  } catch (e) {
    console.warn('elDni scraper error:', e);
  }
  return null;
}

// Helper to build full SUNAT / RENIEC fiscal address with district, province and department
function buildFullFiscalAddress(
  rawAddress?: string,
  distrito?: string,
  provincia?: string,
  departamento?: string
): string {
  const addr = (rawAddress || '').trim().replace(/\s+/g, ' ');
  const dist = (distrito || '').trim();
  const prov = (provincia || '').trim();
  const dep = (departamento || '').trim();

  const ubigeoParts = [dist, prov, dep].filter(Boolean);

  if (!addr) {
    return ubigeoParts.join(' - ');
  }

  if (ubigeoParts.length === 0) {
    return addr;
  }

  const addrUpper = addr.toUpperCase();
  const ubigeoSuffix = ubigeoParts.join(' - ').toUpperCase();

  // If address already contains the full ubigeo pattern or district and department
  if (
    addrUpper.endsWith(ubigeoSuffix) ||
    addrUpper.includes(` - ${ubigeoSuffix}`) ||
    (dist && dep && addrUpper.includes(`- ${dist.toUpperCase()}`) && addrUpper.includes(`- ${dep.toUpperCase()}`))
  ) {
    return addr;
  }

  // Format as: "DIRECCION - DISTRITO - PROVINCIA - DEPARTAMENTO"
  return `${addr} - ${ubigeoParts.join(' - ')}`;
}

// Helper to extract clean RUC data (Name, Address, Condition, State)
function extractRucData(data: any) {
  if (!data) return null;
  const t = data.data || data.result || data.payload || data;

  const name = t.razonSocial || t.razon_social || t.nombre || t.nombre_o_razon_social || t.contribuyente;
  if (!name || typeof name !== 'string' || name.trim().length < 2) return null;

  const rawAddress = t.direccionCompleta || t.direccion || t.direccion_fiscal || t.domicilio_fiscal || t.domicilio || t.address || '';
  const distrito = t.distrito || t.district || t.dist || '';
  const provincia = t.provincia || t.province || t.prov || '';
  const departamento = t.departamento || t.department || t.dep || t.dpto || '';

  const address = buildFullFiscalAddress(rawAddress, distrito, provincia, departamento);

  return {
    success: true,
    name: String(name).trim(),
    address: address ? String(address).trim() : '',
    condition: t.condicion || t.condicion_domicilio || 'HABIDO',
    state: t.estado || t.estado_contribuyente || 'ACTIVO',
    department: departamento || undefined,
    province: provincia || undefined,
    district: distrito || undefined
  };
}

// Scrape official SUNAT consultation portal directly
async function scrapeSunatPortal(ruc: string) {
  const url = `https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias?accion=consPorRuc&nroRuc=${ruc}`;
  const html = await fetchHtmlSafe(url);
  if (!html) return null;

  try {
    let name = '';
    // Look for pattern: 10749052703 - JUAN PEREZ GOMEZ
    const matchRucName = html.match(/(\d{11})\s*-\s*([^\r\n<]+)/);
    if (matchRucName && matchRucName[2]) {
      name = matchRucName[2].trim();
    } else {
      const matchRazon = html.match(/Razón Social[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
      if (matchRazon && matchRazon[1]) {
        name = matchRazon[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      }
    }

    // Look for Domicilio Fiscal
    let address = '';
    const matchDir = html.match(/Domicilio Fiscal:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
    if (matchDir && matchDir[1]) {
      address = matchDir[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    if (name) {
      return {
        success: true,
        name,
        address: address || '',
        condition: 'HABIDO',
        state: 'ACTIVO',
        source: 'SUNAT Portal Directo'
      };
    }
  } catch (e) {
    console.warn('Scraper error:', e);
  }
  return null;
}

// Calculate exact RUC 10 (Persona Natural) for an 8-digit Peruvian DNI
function calculateRuc10(dni: string): string | null {
  const cleanDni = dni.trim().replace(/\D/g, '');
  if (cleanDni.length !== 8) return null;
  const digits = [1, 0, ...cleanDni.split('').map(Number)];
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * weights[i];
  }
  const remainder = sum % 11;
  let check = 11 - remainder;
  if (check === 10) check = 0;
  if (check === 11) check = 1;
  return `10${cleanDni}${check}`;
}

// Decolecta API Integration (Primary Provider with Token)
async function lookupDecolectaDni(dni: string) {
  const token = (process.env.DECOLECTA_API_TOKEN || '').trim();
  if (!token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${dni}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const parsed = data?.data || data?.result || data;
      const name = extractDniName(parsed) || parsed?.nombre || parsed?.nombre_completo || parsed?.razonSocial;
      const rawAddress = parsed?.direccionCompleta || parsed?.direccion || parsed?.domicilioFiscal || parsed?.domicilio || parsed?.address || '';
      const distrito = parsed?.distrito || parsed?.district || '';
      const provincia = parsed?.provincia || parsed?.province || '';
      const departamento = parsed?.departamento || parsed?.department || '';
      const address = buildFullFiscalAddress(rawAddress, distrito, provincia, departamento);

      if (name && typeof name === 'string' && name.trim().length > 3) {
        return {
          success: true,
          name: name.trim(),
          address: address ? address.trim() : '',
          source: 'Decolecta RENIEC API'
        };
      }
    }
  } catch (e) {
    console.warn('Decolecta DNI lookup error:', e);
  }
  return null;
}

async function lookupDecolectaRuc(ruc: string) {
  const token = (process.env.DECOLECTA_API_TOKEN || '').trim();
  if (!token) return null;

  const endpoints = [
    `https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`,
    `https://api.decolecta.com/v1/sunat/ruc/full?numero=${ruc}`
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const parsed = data?.data || data?.result || data;
        if (!parsed) continue;

        const name = parsed.razonSocial || parsed.razon_social || parsed.nombre || parsed.nombre_completo || extractDniName(parsed);
        const rawAddress = parsed.direccionCompleta || parsed.direccion || parsed.domicilioFiscal || parsed.domicilio_fiscal || parsed.address || '';
        const distrito = parsed.distrito || parsed.district || '';
        const provincia = parsed.provincia || parsed.province || '';
        const departamento = parsed.departamento || parsed.department || '';
        const address = buildFullFiscalAddress(rawAddress, distrito, provincia, departamento);
        const condition = parsed.condicion || parsed.condicion_domicilio || 'HABIDO';
        const state = parsed.estado || parsed.estado_contribuyente || 'ACTIVO';

        if (name && typeof name === 'string' && name.trim().length > 3) {
          return {
            success: true,
            name: name.trim(),
            address: address ? address.trim() : '',
            condition,
            state,
            department: departamento || undefined,
            province: provincia || undefined,
            district: distrito || undefined,
            source: 'Decolecta SUNAT API'
          };
        }
      }
    } catch (e) {
      console.warn('Decolecta RUC lookup error:', e);
    }
  }

  return null;
}

// Query RENIEC / SUNAT for DNI (8 digits) with multiple fallback providers
async function lookupDni(dni: string) {
  const cleanDni = dni.trim().replace(/\D/g, '');
  if (cleanDni.length !== 8) return null;

  // Method 1: Check SUNAT official portal using exact calculated RUC 10
  const ruc10 = calculateRuc10(cleanDni);
  if (ruc10) {
    const sunatRes = await scrapeSunatPortal(ruc10);
    if (sunatRes && sunatRes.name) {
      return {
        success: true,
        name: sunatRes.name,
        address: sunatRes.address || '',
        source: 'SUNAT / RENIEC (Persona Natural)'
      };
    }
  }

  // Method 2: eldni.com Direct Scraper
  const elDniName = await scrapeElDni(cleanDni);
  if (elDniName) {
    return {
      success: true,
      name: elDniName,
      address: '',
      source: 'RENIEC Database'
    };
  }

  // Method 3: Public RENIEC / DNI JSON APIs
  const endpoints = [
    `https://api.apis.net.pe/v1/dni?numero=${cleanDni}`,
    `https://api.apis.net.pe/v2/reniec/dni?numero=${cleanDni}`,
    `https://dniruc.apisperu.com/api/v1/dni/${cleanDni}`,
    `https://api.factiliza.com/peru/v1/dni/info/${cleanDni}`,
    `https://consultaruc.isunat.com/api/dni/${cleanDni}`,
    `https://api.perudevs.com/api/v1/dni/complete?document=${cleanDni}`,
    `https://api.perudevs.com/api/v1/dni?document=${cleanDni}`,
    `https://apiperu.dev/api/dni/${cleanDni}`,
    `https://api.atypical.pe/dni/${cleanDni}`,
    `https://api.consultasperu.com/api/v1/dni?dni=${cleanDni}`,
    `https://api.reniec.cloud/dni/${cleanDni}`,
    `https://peruapi.com/api/v1/dni/${cleanDni}`,
    `https://consultaqrr.sutran.gob.pe/api/dni/${cleanDni}`,
    `https://api.dnis.pe/dni/${cleanDni}`,
    `https://consultas.boletape.com/api/dni/${cleanDni}`,
    `https://dniruc.dev/api/dni/${cleanDni}`
  ];

  for (const url of endpoints) {
    const data = await fetchJsonSafe(url);
    const fullName = extractDniName(data);
    if (fullName) {
      return {
        success: true,
        name: fullName,
        address: '',
        source: 'RENIEC Database'
      };
    }
  }

  // Method 4: Fallback JNE / ONPE / PeruDevs public endpoints
  try {
    const jneData = await fetchJsonSafe(`https://api.perudevs.com/api/v1/dni/simple?document=${cleanDni}`);
    const jneName = extractDniName(jneData);
    if (jneName) {
      return {
        success: true,
        name: jneName,
        address: '',
        source: 'RENIEC JNE'
      };
    }
  } catch {
    // Ignore error
  }

  // Method 5: Decolecta API (Fallback when all free methods fail)
  const decolectaRes = await lookupDecolectaDni(cleanDni);
  if (decolectaRes && decolectaRes.name) {
    return decolectaRes;
  }

  return null;
}

// Query SUNAT for RUC (11 digits)
async function lookupRuc(ruc: string) {
  let freeResult: any = null;

  // Tier 1: Try public JSON APIs
  const jsonEndpoints = [
    `https://api.apis.net.pe/v1/ruc?numero=${ruc}`,
    `https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`,
    `https://dniruc.apisperu.com/api/v1/ruc/${ruc}`,
    `https://api.factiliza.com/peru/v1/ruc/info/${ruc}`,
    `https://consultaruc.isunat.com/api/ruc/${ruc}`,
    `https://api.perudevs.com/api/v1/ruc/full?document=${ruc}`,
    `https://api.perudevs.com/api/v1/ruc?document=${ruc}`,
    `https://apiperu.dev/api/ruc/${ruc}`
  ];

  for (const url of jsonEndpoints) {
    const data = await fetchJsonSafe(url);
    const parsed = extractRucData(data);
    if (parsed && parsed.name) {
      if (parsed.address) {
        return parsed; // Complete result (Name + Address) from free API!
      }
      if (!freeResult) freeResult = parsed;
    }
  }

  // Tier 2: Try scraping official SUNAT portal directly
  const portalResult = await scrapeSunatPortal(ruc);
  if (portalResult && portalResult.name) {
    if (portalResult.address) {
      return portalResult; // Complete result from official portal!
    }
    if (!freeResult) freeResult = portalResult;
  }

  // Tier 3: If RUC 10 (Persona Natural con Negocio, e.g., 10749052703)
  // The digits 3..10 are the person's DNI! (e.g. 74905270)
  if (ruc.startsWith('10') && ruc.length === 11) {
    const dniPart = ruc.substring(2, 10);
    const dniResult = await lookupDni(dniPart);
    if (dniResult && dniResult.name) {
      const naturalResult = {
        success: true,
        name: dniResult.name,
        address: dniResult.address || '',
        condition: 'HABIDO',
        state: 'ACTIVO',
        source: 'RENIEC (Persona Natural RUC 10)'
      };
      if (naturalResult.address) return naturalResult;
      if (!freeResult) freeResult = naturalResult;
    }
  }

  // Tier 4: Decolecta API (Fallback if free methods failed OR if free method returned no address)
  const decolectaRes = await lookupDecolectaRuc(ruc);
  if (decolectaRes && decolectaRes.name) {
    return decolectaRes;
  }

  // Return partial free result if Decolecta couldn't find it or had no token
  if (freeResult) {
    return freeResult;
  }

  return null;
}

// Rate Limiter for SUNAT/RENIEC Lookups: Protects 3P API tokens and prevents scraping
const sunatRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const SUNAT_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const SUNAT_RATE_LIMIT_MAX = 30; // 30 requests / minute

// Middleware to verify Firebase ID token using firebase-admin
async function requireFirebaseAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  // 1. Chequeo de disponibilidad de Firebase Admin
  const isReady = await ensureAdminReady();
  if (!isReady) {
    return res.status(503).json({
      success: false,
      error: 'Servicio de autenticación no disponible temporalmente.'
    });
  }

  // 2. Extraer y validar cabecera Authorization Bearer
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Acceso no autorizado: Se requiere token de autorización Bearer de Firebase.'
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: 'Token Bearer ausente o malformado.'
    });
  }

  // 3. Verificar ID token con checkRevoked = true para rechazar tokens revocados
  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(idToken, true);
  } catch (err: any) {
    console.error('Error verificando token de Firebase:', err?.message || err);
    return res.status(401).json({
      success: false,
      error: 'Token de autenticación inválido o vencido.'
    });
  }

  // 4. Consultar con el Admin SDK que users/{uid} exista y tenga status === 'active'
  try {
    const firestore = getDb();
    const userDocSnap = await firestore.collection('users').doc(decodedToken.uid).get();

    if (!userDocSnap.exists) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado: Usuario no registrado o sin permisos.'
      });
    }

    const userData = userDocSnap.data();
    if (userData?.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado: Cuenta de usuario inactiva.'
      });
    }

    // 5. Restricción de horario laboral (06:00 a 19:59 America/Lima, UTC-5) para usuarios no administradores
    const isUserAdmin = decodedToken?.admin === true || userData?.role === 'admin';
    if (!isUserAdmin) {
      // Hora actual en Lima (America/Lima, UTC-5 constante sin horario de verano)
      const limaDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const limaHour = limaDate.getUTCHours();

      if (limaHour < 6 || limaHour >= 20) {
        return res.status(403).json({
          success: false,
          error: 'Acceso fuera del horario permitido.',
          message: 'Acceso fuera del horario permitido.'
        });
      }
    }

    (req as any).user = {
      ...decodedToken,
      profile: userData
    };
    next();
  } catch (err: any) {
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('insufficient permissions')) {
      console.error('A la service account le falta el rol "Cloud Datastore User":', err?.message || err);
    } else {
      console.error('Error consultando perfil de usuario en Firestore:', err?.message || err);
    }
    if (err?.code === 7 || err?.code === 5 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('insufficient permissions') || err?.message?.includes('NOT_FOUND')) {
      return res.status(503).json({
        success: false,
        error: 'Servicio de autenticación no disponible temporalmente.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Error interno verificando estado de usuario.'
    });
  }
}

// Server-side SUNAT / RENIEC Lookup Route with real Firebase ID token verification and dual rate-limiting
app.get("/api/sunat/:number", requireFirebaseAuth, async (req, res) => {
  // 1. Strict Input Format Validation
  const rawParam = req.params.number ? req.params.number.trim() : '';
  if (!/^\d{8}$|^\d{11}$/.test(rawParam)) {
    return res.status(400).json({
      success: false,
      error: 'Formato inválido. El parámetro debe ser exactamente un DNI numérico (8 dígitos) o un RUC (11 dígitos).'
    });
  }

  const num = rawParam;

  // 2. Dual Rate Limiting (by real client IP and authenticated user UID)
  // Express 'trust proxy' provides the real client IP in req.ip
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const userUid = (req as any).user?.uid || 'anon';
  const now = Date.now();

  const ipKey = `ip:${clientIp}`;
  const uidKey = `uid:${userUid}`;

  for (const key of [ipKey, uidKey]) {
    let rateRecord = sunatRateLimitMap.get(key);
    if (!rateRecord || now > rateRecord.resetTime) {
      rateRecord = { count: 1, resetTime: now + SUNAT_RATE_LIMIT_WINDOW };
      sunatRateLimitMap.set(key, rateRecord);
    } else {
      rateRecord.count++;
      if (rateRecord.count > SUNAT_RATE_LIMIT_MAX) {
        return res.status(429).json({
          success: false,
          error: 'Límite de consultas excedido (máximo 30 consultas por minuto). Por favor espere un momento antes de reintentar.'
        });
      }
    }
  }

  // Periodic cleanup of expired rate limit entries
  if (sunatRateLimitMap.size > 1000) {
    for (const [key, value] of sunatRateLimitMap.entries()) {
      if (now > value.resetTime) {
        sunatRateLimitMap.delete(key);
      }
    }
  }

  // 3. Check cache first
  const cached = lookupCache.get(num);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return res.json(cached.data);
  }

  if (num.length === 11) {
    const rucResult = await lookupRuc(num);
    if (rucResult) {
      lookupCache.set(num, { data: rucResult, timestamp: Date.now() });
      return res.json(rucResult);
    }
    return res.status(404).json({
      success: false,
      error: 'No se encontraron datos automáticos para el RUC ingresado. Puede ingresar la Razón Social y Dirección Fiscal manualmente.'
    });
  }

  if (num.length === 8) {
    const dniResult = await lookupDni(num);
    if (dniResult) {
      lookupCache.set(num, { data: dniResult, timestamp: Date.now() });
      return res.json(dniResult);
    }
    return res.status(404).json({
      success: false,
      error: 'No se encontraron datos en RENIEC para el DNI ingresado. Puede ingresar el nombre del cliente manualmente.'
    });
  }

  return res.status(400).json({
    success: false,
    error: 'El número ingresado debe ser RUC (11 dígitos) o DNI (8 dígitos).'
  });
});

// Server startup
if (process.env.NODE_ENV !== "production") {
  startDevServer();
} else {
  startProdServer();
}

async function startDevServer() {
  let viteMiddlewareInstance: any = null;
  let viteReady = false;

  // Intercept requests so API routes execute immediately and frontend routes wait for Vite if needed
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    if (viteReady && viteMiddlewareInstance) {
      return viteMiddlewareInstance(req, res, next);
    }
    // If frontend request arrives while Vite is still loading, wait briefly
    const interval = setInterval(() => {
      if (viteReady && viteMiddlewareInstance) {
        clearInterval(interval);
        return viteMiddlewareInstance(req, res, next);
      }
    }, 50);
    setTimeout(() => {
      clearInterval(interval);
      if (!res.headersSent) {
        next();
      }
    }, 8000);
  });

  // Bind to port 3000 immediately so container health checks succeed with zero delay
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dev Server listening on http://0.0.0.0:${PORT}`);
  });

  try {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    viteMiddlewareInstance = vite.middlewares;
    viteReady = true;
    console.log("Vite dev middleware attached successfully.");
  } catch (err) {
    console.error("Error initializing Vite dev middleware:", err);
  }
}

function startProdServer() {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Prod Server running on http://0.0.0.0:${PORT}`);
  });
}
