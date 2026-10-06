import { test, expect } from '@playwright/test';

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
