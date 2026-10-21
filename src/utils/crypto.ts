/**
 * Utilidades criptográficas para verificación y migración de contraseñas legadas.
 * Conforme a las recomendaciones de OWASP Password Storage Cheat Sheet,
 * la derivación moderna utiliza PBKDF2-HMAC-SHA256 con 600,000 iteraciones.
 *
 * Mantiene compatibilidad estricta para la migración perezosa de hashes existentes
 * (SHA-256 simple y PBKDF2 previo) hacia Firebase Authentication.
 */

const PBKDF2_ITERATIONS = 600000; // OWASP recommendation for PBKDF2-HMAC-SHA256
const PBKDF2_KEY_LENGTH = 32;     // 256 bits
const PBKDF2_PREFIX = 'pbkdf2';

/**
 * Comparación en tiempo constante para prevenir ataques de temporización (timing attacks).
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Convierte un ArrayBuffer o Uint8Array a cadena hexadecimal en minúsculas.
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Valida y convierte una cadena hexadecimal a Uint8Array.
 * Lanza error si el formato es inválido o la longitud es impar.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new TypeError('El argumento debe ser una cadena hexadecimal.');
  }
  const cleanHex = hex.trim().replace(/^0x/i, '');
  if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) {
    throw new Error('Longitud hexadecimal inválida: debe ser un número par de caracteres.');
  }
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error('Cadena hexadecimal inválida: contiene caracteres no válidos.');
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Genera un salt criptográfico seguro en hexadecimal.
 * Lanza un error explícito si la Web Crypto API no está disponible (sin fallbacks inseguros).
 */
export function generateSalt(length: number = 16): string {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.getRandomValues) {
    throw new Error('Seguridad comprometida: Web Crypto API (crypto.getRandomValues) no disponible en este entorno.');
  }
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return bufferToHex(array);
}

/**
 * Deriva una clave usando PBKDF2-HMAC-SHA256 con Web Crypto API.
 */
async function derivePbkdf2(
  password: string, 
  salt: string, 
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Seguridad comprometida: Web Crypto API (crypto.subtle) no disponible en este entorno.');
  }

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
 * Hashea una contraseña usando PBKDF2 (600,000 iteraciones con SHA-256).
 * Lanza un error explícito si Web Crypto no está presente.
 */
export async function hashPassword(
  password: string, 
  customSalt?: string
): Promise<{ hash: string; salt: string }> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Seguridad comprometida: Web Crypto API no disponible para derivación segura de contraseñas.');
  }

  const salt = customSalt || generateSalt(16);
  const derivedHex = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);

  return {
    hash: `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}:${salt}:${derivedHex}`,
    salt
  };
}

/**
 * Fallback de verificación para hashes SHA-256 legados de versiones iniciales.
 */
async function computeLegacySha256(dataToHash: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(dataToHash));
    return bufferToHex(hashBuffer);
  }
  throw new Error('Web Crypto API no disponible para verificación de hash.');
}

/**
 * Valida contraseñas contra hashes legados (SHA-256 o PBKDF2 previo) para permitir
 * la migración perezosa a Firebase Authentication en el primer inicio de sesión.
 */
export async function verifyPasswordWithMigration(
  password: string,
  salt: string,
  storedHash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> {
  if (!storedHash || !password || typeof storedHash !== 'string') {
    return { isValid: false, needsRehash: false };
  }

  // Caso 1: Hash PBKDF2 (formato "pbkdf2:<iteraciones>:<salt>:<hashHex>")
  if (storedHash.startsWith(`${PBKDF2_PREFIX}:`)) {
    const parts = storedHash.split(':');
    if (parts.length >= 4) {
      const iterations = parseInt(parts[1], 10);
      const hashSalt = parts[2];
      const expectedHash = parts[3];

      // Validación estricta de formato de los componentes
      if (isNaN(iterations) || iterations < 1000 || !hashSalt || !/^[0-9a-fA-F]+$/.test(expectedHash)) {
        return { isValid: false, needsRehash: false };
      }

      try {
        const derived = await derivePbkdf2(password, hashSalt, iterations);
        const isValid = constantTimeCompare(derived.toLowerCase(), expectedHash.toLowerCase());
        return { isValid, needsRehash: false };
      } catch (err) {
        console.error('Error durante verificación PBKDF2:', err);
        return { isValid: false, needsRehash: false };
      }
    }
    return { isValid: false, needsRehash: false };
  }

  // Caso 2: Hash SHA-256 simple legado ("<hex64>")
  if (!/^[0-9a-fA-F]{64}$/.test(storedHash.trim())) {
    return { isValid: false, needsRehash: false };
  }

  try {
    const dataToHash = `${salt}:${password}`;
    const legacyCalculated = await computeLegacySha256(dataToHash);
    const isValid = constantTimeCompare(legacyCalculated.toLowerCase(), storedHash.trim().toLowerCase());
    return {
      isValid,
      needsRehash: isValid // Si coincide, debe migrarse a Firebase Auth
    };
  } catch (err) {
    console.error('Error calculando SHA-256 legado:', err);
    return { isValid: false, needsRehash: false };
  }
}

/**
 * Función estándar de verificación de compatibilidad.
 */
export async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const result = await verifyPasswordWithMigration(password, salt, storedHash);
  return result.isValid;
}
