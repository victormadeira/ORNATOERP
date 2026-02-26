// ═══════════════════════════════════════════════════════
// PDF Generation — Puppeteer singleton + htmlToPdf utility
// ═══════════════════════════════════════════════════════
import puppeteer from 'puppeteer';

let browser = null;

async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
    }
    return browser;
}

/**
 * Converte HTML completo em PDF buffer
 * @param {string} html — documento HTML completo
 * @param {object} options — { format, landscape, margin }
 * @returns {Buffer}
 */
export async function htmlToPdf(html, options = {}) {
    const br = await getBrowser();
    const page = await br.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
        const pdf = await page.pdf({
            format: options.format || 'A4',
            landscape: options.landscape || false,
            printBackground: true,
            margin: options.margin || { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
        });
        return Buffer.from(pdf);
    } finally {
        await page.close();
    }
}

// Graceful shutdown
process.on('SIGINT', async () => { if (browser) await browser.close(); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); });
