// ═══════════════════════════════════════════════════════
// PDF Generation — Puppeteer singleton + htmlToPdf utility
// ═══════════════════════════════════════════════════════
import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

let browser = null;
let launchRetries = 0;
const MAX_RETRIES = 3;

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

async function closeBrowser() {
    if (browser) {
        try { await browser.close(); } catch { }
        browser = null;
    }
}

async function getBrowser() {
    // Se browser existe mas desconectou, fechar e recriar
    if (browser && !browser.isConnected()) {
        console.log('  Puppeteer: browser desconectou, recriando...');
        await closeBrowser();
    }

    if (!browser) {
        const execPath = findChromiumPath();
        console.log(`  Puppeteer: lançando com ${execPath || 'Chromium bundled'}`);
        try {
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
                    '--font-render-hinting=none',
                ],
                // Timeout para launch (30s)
                timeout: 30000,
            });

            // Listener para desconexão inesperada
            browser.on('disconnected', () => {
                console.log('  Puppeteer: browser desconectou inesperadamente');
                browser = null;
            });

            launchRetries = 0;
            console.log('  Puppeteer: browser pronto');
        } catch (err) {
            browser = null;
            launchRetries++;
            console.error(`  Puppeteer: ERRO ao lançar (tentativa ${launchRetries}/${MAX_RETRIES}):`, err.message);
            if (launchRetries < MAX_RETRIES) {
                console.log('  Puppeteer: tentando novamente em 2s...');
                await new Promise(r => setTimeout(r, 2000));
                return getBrowser();
            }
            throw new Error(`Chromium não pôde ser iniciado após ${MAX_RETRIES} tentativas: ${err.message}`);
        }
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
    let page = null;
    try {
        const br = await getBrowser();
        page = await br.newPage();

        // Bloquear requisições externas (imagens/fontes externas causam timeout)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const url = req.url();
            // Permitir data: URIs e about:blank, bloquear todo o resto
            if (url.startsWith('data:') || url.startsWith('about:')) {
                req.continue();
            } else {
                // Bloquear requests de rede (imagens externas, fontes, etc.)
                req.abort('blockedbyclient');
            }
        });

        // Usar domcontentloaded ao invés de networkidle0
        // O HTML da proposta usa base64 inline, não precisa esperar rede
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });

        const pdf = await page.pdf({
            format: options.format || 'A4',
            landscape: options.landscape || false,
            printBackground: true,
            margin: options.margin || { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
            timeout: 60000,
        });
        return Buffer.from(pdf);
    } catch (err) {
        // Se o browser crashou durante a geração, resetar para próxima tentativa
        if (err.message?.includes('disconnected') || err.message?.includes('Target closed') || err.message?.includes('Session closed')) {
            console.log('  Puppeteer: browser crashou durante PDF, resetando...');
            await closeBrowser();
        }
        throw err;
    } finally {
        if (page) {
            try { await page.close(); } catch { }
        }
    }
}

/**
 * Testa se o Puppeteer funciona (usado pelo health check)
 */
export async function testPdf() {
    const testHtml = '<html><body><h1>Teste PDF</h1><p>OK</p></body></html>';
    const buf = await htmlToPdf(testHtml);
    return { ok: true, size: buf.length, chromium: findChromiumPath() || 'bundled' };
}

// Graceful shutdown
process.on('SIGINT', async () => { await closeBrowser(); });
process.on('SIGTERM', async () => { await closeBrowser(); });
