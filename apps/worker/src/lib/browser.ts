/**
 * Singleton Chromium para o worker (004/T-007 + RNF-08).
 *
 * Uma única instância é mantida viva entre jobs. O health check antes de cada
 * uso garante relançamento automático em caso de crash. O singleton é fechado
 * no shutdown pelo stopBoss (via index.ts).
 */
import { chromium, type Browser } from 'playwright';

let browser: Browser | null = null;

/**
 * Retorna o browser Chromium, lançando-o se ainda não estiver ativo ou se
 * tiver crashado. Idempotente — safe para chamar antes de cada job.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    return browser;
  }
  // Fechar instância morta antes de abrir nova
  if (browser) {
    try {
      await browser.close();
    } catch {
      /* já fechado */
    }
    browser = null;
  }
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
    ],
  });
  browser.on('disconnected', () => {
    console.warn('[worker][browser] Chromium desconectado — será relançado no próximo job.');
    browser = null;
  });
  console.log('[worker][browser] Chromium iniciado.');
  return browser;
}

/** Fecha o Chromium (chamado no shutdown do worker). */
export async function closeBrowser(): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    /* ignorar erros de fechamento */
  }
  browser = null;
  console.log('[worker][browser] Chromium encerrado.');
}
