/**
 * Utilidades para formatear números e impresiones según el estándar textil (coma decimal y 2 decimales fijos)
 * Ejemplo: 100 -> "100,00", 36.1 -> "36,10", 78 -> "78,00"
 */

export function formatPrintNumber(
  val: number | string | undefined | null,
  decimals: number = 2,
  fallback: string = '-'
): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '').trim());
  if (isNaN(num)) return fallback;
  return num.toFixed(decimals).replace('.', ',');
}

export function formatPrintInteger(
  val: number | string | undefined | null,
  fallback: string = '-'
): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '').trim());
  if (isNaN(num)) return fallback;
  return Math.round(num).toString();
}

export function formatCurrencyPrint(
  val: number | string | undefined | null,
  decimals: number = 2,
  prefix: string = 'S/. '
): string {
  if (val === undefined || val === null || val === '') return '';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '').trim());
  if (isNaN(num) || num <= 0) return '';
  
  const formatted = num.toFixed(decimals).replace('.', ',');
  return `${prefix}${formatted}`;
}
