import { Provider } from '../types';

export const SAN_JACINTO_TONOS = ['-', 'A', 'B', 'C', 'D'] as const;
export type SanJacintoTono = typeof SAN_JACINTO_TONOS[number];

/**
 * Detects if a provider or provider name belongs to "San Jacinto"
 */
export function isSanJacintoProvider(providerOrName?: Provider | string | null): boolean {
  if (!providerOrName) return false;
  const name = typeof providerOrName === 'string' ? providerOrName : providerOrName.name;
  if (!name) return false;
  return /san\s*jacinto|jacinto/i.test(name.trim());
}

/**
 * Normalizes a tone input for San Jacinto:
 * - Valid tones: 'A', 'B', 'C', 'D', and '-'
 * - '-' means "Sin tono" (without tone)
 * - If empty, null, undefined, unreferenced, or invalid, it MUST default to / remain '-'
 */
export function normalizeSanJacintoTono(val?: string | null): SanJacintoTono {
  if (val === null || val === undefined) return '-';
  const clean = val.toString().trim().toUpperCase();
  
  if (clean === '' || clean === '-' || clean === 'SIN TONO' || clean === 'NINGUNO' || clean === 'NO' || clean === 'N/A' || clean === 'NONE') {
    return '-';
  }
  
  // Direct matches
  if (clean === 'A' || clean === 'B' || clean === 'C' || clean === 'D') {
    return clean as SanJacintoTono;
  }

  // Handle patterns like "TONO A", "TONO: B", "T-C", "COLOR A", etc.
  const match = clean.match(/^(?:TONO|COLOR|T)?[_:\s-]*([A-D])$/);
  if (match && match[1]) {
    return match[1] as SanJacintoTono;
  }

  // If there is no valid reference, it must always stay as '-'
  return '-';
}

/**
 * Checks if a value is a valid San Jacinto tone ('A' | 'B' | 'C' | 'D' | '-')
 */
export function isValidSanJacintoTono(val?: string | null): boolean {
  if (!val) return false;
  const clean = val.toString().trim().toUpperCase();
  return clean === '-' || clean === 'A' || clean === 'B' || clean === 'C' || clean === 'D';
}
