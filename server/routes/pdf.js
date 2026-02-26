import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { htmlToPdf } from '../pdf.js';

const router = Router();

// POST /api/pdf/generate — recebe HTML, retorna PDF buffer
router.post('/generate', requireAuth, async (req, res) => {
    try {
        const { html, options } = req.body;
        if (!html) return res.status(400).json({ error: 'HTML obrigatório' });

        const pdfBuffer = await htmlToPdf(html, options || {});
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': 'inline; filename="documento.pdf"',
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ error: 'Erro ao gerar PDF' });
    }
});

export default router;
