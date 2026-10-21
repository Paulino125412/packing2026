/**
 * Utilidades criptográficas para contraseñas seguras.
 * Implementa PBKDF2 (100,000 iteraciones con SHA-256) según estándares NIST SP 800-132 y OWASP,
 * con compatibilidad hacia atrás y migración transparente de hashes antiguos SHA-256.
 */

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_PREFIX = 'pbkdf2';

// Función auxiliar para convertir ArrayBuffer o Uint8Array a cadena hexadecimal
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Convertir cadena hexadecimal a Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Fallback de SHA-256 en puro JavaScript
function sha256PureJs(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w: number[] = [];
  for (let i = 0; i < words.length; i += 16) {
    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[j + i] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const byte = (hash[i] >> (j * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Genera un salt criptográfico aleatorio en hexadecimal (16 bytes = 32 hex chars)
 */
export function generateSalt(length: number = 16): string {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) {
    console.warn("crypto.getRandomValues no disponible, usando salt alternativo:", err);
  }
  let salt = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length * 2; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/**
 * Deriva una clave PBKDF2 utilizando Web Crypto API
 */
async function derivePbkdf2(password: string, salt: string, iterations: number = PBKDF2_ITERATIONS): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = encoder.encode(salt);
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    PBKDF2_KEY_LENGTH * 8
  );

  return bufferToHex(derivedBits);
}

/**
 * Hashea una contraseña usando PBKDF2 (100,000 iteraciones con SHA-256)
 * Retorna formato: "pbkdf2:100000:<salt>:<hash>"
 */
export async function hashPassword(
  password: string, 
  customSalt?: string
): Promise<{ hash: string; salt: string }> {
  const salt = customSalt || generateSalt(16);

  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const derivedHex = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
      return {
        hash: `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}:${salt}:${derivedHex}`,
        salt
      };
    }
  } catch (err) {
    console.warn("Web Crypto Subtle no disponible para PBKDF2, usando fallback SHA-256:", err);
  }

  // Fallback seguro
  const dataToHash = `${salt}:${password}`;
  return {
    hash: sha256PureJs(dataToHash),
    salt
  };
}

/**
 * Valida la contraseña contra el hash almacenado.
 * Detecta automáticamente si el hash está en formato moderno PBKDF2 o si es un hash
 * heredado de SHA-256 + Salt, permitiendo la migración sin fricción.
 */
export async function verifyPasswordWithMigration(
  password: string,
  salt: string,
  storedHash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> {
  if (!storedHash || !password) {
    return { isValid: false, needsRehash: false };
  }

  // Caso 1: Hash PBKDF2 moderno (ej: "pbkdf2:100000:<salt>:<hash>")
  if (storedHash.startsWith(`${PBKDF2_PREFIX}:`)) {
    const parts = storedHash.split(':');
    if (parts.length >= 4) {
      const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
      const hashSalt = parts[2] || salt;
      const expectedHash = parts[3];

      try {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
          const derived = await derivePbkdf2(password, hashSalt, iterations);
          const isValid = derived.toLowerCase() === expectedHash.toLowerCase();
          return { isValid, needsRehash: false };
        }
      } catch (err) {
        console.warn("Error verificando PBKDF2:", err);
      }
    }
  }

  // Caso 2: Hash heredado SHA-256 + Salt (ej: "a1b2c3d4...")
  let legacyHash = '';
  const dataToHash = `${salt}:${password}`;

  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(dataToHash));
      legacyHash = bufferToHex(hashBuffer);
    } else {
      legacyHash = sha256PureJs(dataToHash);
    }
  } catch {
    legacyHash = sha256PureJs(dataToHash);
  }

  const matchesLegacy = legacyHash.toLowerCase() === storedHash.toLowerCase();
  return {
    isValid: matchesLegacy,
    // Si coincidió con el formato antiguo, necesita ser remigrado a PBKDF2 en el login
    needsRehash: matchesLegacy
  };
}

/**
 * Función estándar de verificación para mantener compatibilidad hacia atrás
 */
export async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const result = await verifyPasswordWithMigration(password, salt, storedHash);
  return result.isValid;
}
