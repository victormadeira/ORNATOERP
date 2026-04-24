// ═══════════════════════════════════════════════════════════════
// gen-og-image.mjs — gera public/og-image.jpg (1200×630)
// ═══════════════════════════════════════════════════════════════
// Uso:  node scripts/gen-og-image.mjs
// Requer: public/logo-ornato.png (o monograma da marca)
// Saída:  public/og-image.jpg (usado em WhatsApp/FB/LinkedIn previews)
// ═══════════════════════════════════════════════════════════════
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const logoPath = path.join(root, 'public', 'logo-ornato.png');
const outPath = path.join(root, 'public', 'og-image.jpg');

if (!existsSync(logoPath)) {
    console.error(`\n❌ Logo não encontrado em: ${logoPath}`);
    console.error('   Salve o monograma Ornato como public/logo-ornato.png e rode de novo.\n');
    process.exit(1);
}

// Lê o logo como base64 pra embutir no HTML (sem depender de servidor)
const logoB64 = readFileSync(logoPath).toString('base64');
const logoDataUri = `data:image/png;base64,${logoB64}`;

// HTML template — 1200×630, identidade Ornato (marrom escuro + cobre)
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width: 1200px; height: 630px;
    background: #1A1412;
    font-family: 'Inter', system-ui, sans-serif;
    color: #EDE4D8;
    display: flex;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  /* textura sutil de grain */
  body::before {
    content:''; position:absolute; inset:0;
    background:
      radial-gradient(ellipse 800px 400px at 100% 0%, rgba(176,120,85,0.15), transparent 60%),
      radial-gradient(ellipse 600px 300px at 0% 100%, rgba(176,120,85,0.08), transparent 60%);
    pointer-events:none;
  }
  .wrap {
    display: flex; align-items: center; gap: 72px;
    padding: 0 80px;
    width: 100%;
    position: relative; z-index: 1;
  }
  .logo-box {
    width: 260px; height: 260px;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: #0F0B09;
    border-radius: 28px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(176,120,85,0.15);
    padding: 28px;
  }
  .logo-box img {
    width: 100%; height: 100%;
    object-fit: contain;
  }
  .text {
    flex: 1;
  }
  .brand {
    font-family: 'Playfair Display', serif;
    font-size: 76px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    color: #EDE4D8;
    margin-bottom: 16px;
  }
  .brand span {
    color: #B07855;
  }
  .tagline {
    font-size: 28px;
    font-weight: 300;
    line-height: 1.3;
    color: #A89787;
    letter-spacing: -0.01em;
    max-width: 620px;
    margin-bottom: 28px;
  }
  .tagline strong {
    color: #EDE4D8;
    font-weight: 600;
  }
  .meta {
    display: flex; align-items: center; gap: 16px;
    font-size: 18px;
    color: #B07855;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .meta::before {
    content:''; width: 48px; height: 2px; background: #B07855;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="logo-box">
      <img src="${logoDataUri}" alt="Ornato"/>
    </div>
    <div class="text">
      <div class="brand">Studio <span>Ornato</span></div>
      <div class="tagline">Marcenaria <strong>sob medida</strong> de alto padrão em São Luís — do briefing à instalação.</div>
      <div class="meta">SÃO LUÍS · MARANHÃO</div>
    </div>
  </div>
</body>
</html>`;

console.log('🎨 Renderizando og-image 1200×630...');

const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });

// Espera as fontes carregarem
await page.evaluate(() => document.fonts.ready);

const buf = await page.screenshot({
    type: 'jpeg',
    quality: 92,
    fullPage: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
});

writeFileSync(outPath, buf);
await browser.close();

const kb = (buf.length / 1024).toFixed(1);
console.log(`✅ Salvo: ${outPath} (${kb} KB)`);
console.log('   Rode `npm run build` e faça deploy pro /og-image.jpg ir ao ar.\n');
