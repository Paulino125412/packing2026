import { test, expect } from '@playwright/test';
import { parseSanitizedNumeric } from '../src/components/packing-list-form/ExcelPasteParser';

test.describe('Pruebas unitarias para parseSanitizedNumeric', () => {
  const cases: Array<{ input: string; expected: number | null }> = [
    { input: "48.500", expected: 48.5 },
    { input: "50.125", expected: 50.125 },
    { input: "0.250", expected: 0.25 },
    { input: "120,50", expected: 120.5 },
    { input: "120.50", expected: 120.5 },
    { input: "1.250,50", expected: 1250.5 },
    { input: "1,250.50", expected: 1250.5 },
    { input: "1 250", expected: 1250 },
    { input: "50 m", expected: 50 },
    { input: "50mts", expected: 50 },
    { input: "12.5kg", expected: 12.5 },
    { input: "3B04067940", expected: null },
    { input: "", expected: null },
    { input: "1.2.3", expected: null },
    { input: "12,5,3", expected: null },
  ];

  for (const { input, expected } of cases) {
    test(`parseSanitizedNumeric("${input}") -> ${expected}`, () => {
      expect(parseSanitizedNumeric(input)).toBe(expected);
    });
  }
});

test.describe('Infraestructura y Verificación del Sistema', () => {
  test('GET /api/health responde 200 y estado ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('La página principal carga y no muestra errores en consola graves', async ({ page }) => {
    const severeErrors: string[] = [];

    page.on('pageerror', error => {
      severeErrors.push(error.message);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filtrar advertencias benignas esperadas de red o websocket en preview
        if (!text.includes('Failed to load resource') && !text.includes('WebSocket')) {
          severeErrors.push(text);
        }
      }
    });

    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);

    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('body')).toBeVisible();

    expect(severeErrors).toHaveLength(0);
  });

  test('POST /api/sentry-tunnel con un body de más de 200kb responde 413', async ({ request }) => {
    // Generar un payload de 250 KB (superior al límite de 200 KB)
    const largePayload = Buffer.alloc(250 * 1024, 'a');

    const response = await request.post('/api/sentry-tunnel', {
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      data: largePayload,
    });

    expect(response.status()).toBe(413);
  });
});
