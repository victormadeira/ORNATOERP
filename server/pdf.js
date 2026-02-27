// ═══════════════════════════════════════════════════════
// PDF Generation — Puppeteer singleton + htmlToPdf utility
// ═══════════════════════════════════════════════════════
import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

let browser = null;

// Detectar path do Chromium automaticamente
function findChromiumPath() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && existsSync(envPath)) return envPath;

    // Caminhos comuns em Ubuntu/Debian
    const paths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',
    ];
    for (const p of paths) {
        if (existsSync(p)) return p;
    }
    return undefined; // Puppeteer usa o bundled
}

async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        const execPath = findChromiumPath();
        console.log(`  Puppeteer: usando ${execPath || 'Chromium bundled'}`);
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: execPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-software-rasterizer',
                '--single-process',
            ],
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
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
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
