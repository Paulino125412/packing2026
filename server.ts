import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import puppeteer, { Browser } from "puppeteer";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Sentry Tunnel Route: Bypasses browser AdBlockers and Brave Shields
app.post("/api/sentry-tunnel", express.raw({ type: "*/*", limit: "5mb" }), async (req, res) => {
  try {
    const envelope = req.body;
    const envelopeString = envelope.toString("utf8");
    const piece = envelopeString.split("\n")[0];
    const header = JSON.parse(piece);
    const dsn = new URL(header.dsn);
    const projectId = dsn.pathname.replace("/", "");

    if (!dsn.hostname.endsWith(".sentry.io")) {
      return res.status(403).json({ error: "Invalid DSN host" });
    }

    const sentryUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`;
    const response = await fetch(sentryUrl, {
      method: "POST",
      body: envelope,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
      },
    });

    res.status(response.status).send(await response.text());
  } catch (e: any) {
    console.error("Error en Sentry Tunnel:", e);
    res.status(500).json({ error: e?.message || "Tunnel error" });
  }
});

// Standard health check route for container & proxy readiness
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
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

// Server-side SUNAT / RENIEC Lookup Route
app.get("/api/sunat/:number", async (req, res) => {
  const num = req.params.number.trim().replace(/\D/g, '');

  if (!num) {
    return res.status(400).json({ success: false, error: 'Ingrese un número de RUC o DNI.' });
  }

  // Check cache first
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

// Helper to find Chrome executable in container environment or local cache
function findChromeExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Common paths in container or Linux systems
  const candidatePaths = [
    '/tmp/puppeteer-chrome/linux-155.0.8043.0/chrome-linux64/chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  // Search inside local chrome directory if downloaded by puppeteer browsers
  const localChromeDir = path.join(process.cwd(), 'chrome');
  if (fs.existsSync(localChromeDir)) {
    const findBinary = (dir: string): string | null => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findBinary(fullPath);
            if (found) return found;
          } else if (entry.isFile() && (entry.name === 'chrome' || entry.name === 'chromium') && !entry.name.endsWith('.so')) {
            return fullPath;
          }
        }
      } catch {
        return null;
      }
      return null;
    };
    const found = findBinary(localChromeDir);
    if (found) return found;
  }

  return undefined;
}

// Shared Puppeteer Browser instance for high performance PDF generation
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  try {
    const executablePath = findChromeExecutable();
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none'
      ]
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    browserInstance = await puppeteer.launch(launchOptions);
    browserInstance.on('disconnected', () => {
      browserInstance = null;
    });
    return browserInstance;
  } catch (err) {
    browserInstance = null;
    throw err;
  }
}

// PDF Generation Endpoint via Server-side Headless Puppeteer
app.post("/api/generate-pdf", async (req, res) => {
  const { html, css } = req.body;
  console.log('[PDF DEBUG] html length:', html?.length || 0, 'css length:', css?.length || 0);

  if (!html || typeof html !== 'string' || html.length > 500_000) {
    return res.status(400).json({ error: 'HTML inválido o demasiado grande' });
  }
  if (css && (typeof css !== 'string' || css.length > 500_000)) {
    return res.status(400).json({ error: 'CSS inválido o demasiado grande' });
  }

  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1400 });

    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    ${css || ''}
    #print-section, #print-section *, .sales-ficha-print-sheet, .sales-ficha-print-sheet * {
      visibility: visible !important;
    }
  </style>
</head>
<body>
  <div id="print-section">
    ${html}
  </div>
</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 20000
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length.toString(),
      'Content-Disposition': 'attachment; filename="document.pdf"'
    });

    return res.send(Buffer.from(pdfBuffer));
  } catch (error: any) {
    console.error("Puppeteer PDF generation error:", error);
    const isTimeout = error?.name === 'TimeoutError' || /timeout/i.test(error?.message || '');
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? "La generación del PDF tardó demasiado y se canceló. Intente nuevamente."
        : "Error al generar el PDF en el servidor",
      details: error?.message || String(error)
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.warn("Error closing page:", e);
      }
    }
  }
});

// Vite middleware for development mode
if (process.env.NODE_ENV !== "production") {
  startDevServer();
} else {
  startProdServer();
}

async function startDevServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dev Server running on http://0.0.0.0:${PORT}`);
  });
}

function startProdServer() {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Prod Server running on http://0.0.0.0:${PORT}`);
  });
}
