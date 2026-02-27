import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { htmlToPdf, testPdf } from '../pdf.js';

const router = Router();

// POST /api/pdf/generate — recebe HTML, retorna PDF buffer
router.post('/generate', requireAuth, async (req, res) => {
    try {
        const { html, options } = req.body;
        if (!html) return res.status(400).json({ error: 'HTML obrigatório' });

        console.log(`  PDF: gerando (HTML ${(html.length / 1024).toFixed(0)}KB)...`);
        const start = Date.now();
        const pdfBuffer = await htmlToPdf(html, options || {});
        const elapsed = Date.now() - start;
        console.log(`  PDF: gerado com sucesso (${(pdfBuffer.length / 1024).toFixed(0)}KB, ${elapsed}ms)`);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': 'inline; filename="documento.pdf"',
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('PDF generation error:', err.message || err);
        const detail = err.message || 'Erro desconhecido';
        // Enviar detalhes do erro para facilitar debug
        res.status(500).json({
            error: 'Erro ao gerar PDF',
            detail: detail.substring(0, 200),
        });
    }
});

// GET /api/pdf/test — testa se Puppeteer/Chromium funciona
router.get('/test', requireAuth, async (req, res) => {
    try {
        console.log('  PDF: testando Puppeteer...');
        const result = await testPdf();
        console.log('  PDF: teste OK', result);
        res.json(result);
    } catch (err) {
        console.error('PDF test error:', err.message || err);
        res.status(500).json({
            ok: false,
            error: err.message || 'Erro ao testar PDF',
        });
    }
});

export default router;
