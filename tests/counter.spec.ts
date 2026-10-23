import { test, expect } from '@playwright/test';
import { computeNextPackingNumber } from '../src/utils/counterUtils';

test.describe('computeNextPackingNumber Unit Tests', () => {
  test('contador inexistente y máximo 0 -> 1', () => {
    const next = computeNextPackingNumber(0, 0, false);
    expect(next).toBe(1);
  });

  test('contador 5 y máximo 5 -> 6', () => {
    const next = computeNextPackingNumber(5, 5, true);
    expect(next).toBe(6);
  });

  test('contador 5 y máximo 7 -> error de contador desfasado', () => {
    expect(() => computeNextPackingNumber(5, 7, true)).toThrow(/contador desfasado/i);
  });

  test('contador inexistente y máximo 3 -> error de contador desfasado', () => {
    expect(() => computeNextPackingNumber(0, 3, false)).toThrow(/contador desfasado/i);
  });
});
