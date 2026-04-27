/**
 * ZPL (Zebra Programming Language) generator for CNC labels.
 * Generates ZPL II code for Zebra industrial printers.
 *
 * Supports: text, barcode (Code128), QR code, rectangles, edge diagrams.
 */

/**
 * Convert mm to dots (ZPL resolution: 203 dpi = 8 dots/mm)
 */
function mmToDots(mm, dpi = 203) {
    return Math.round(mm * dpi / 25.4);
}

/**
 * Generate ZPL for a single label from template elements and etiqueta data.
 * @param {Array} elementos - Template elements from EditorEtiquetas
 * @param {object} et - Etiqueta data (resolved variables)
 * @param {object} cfg - Label config
 * @param {object} opts - { largura, altura, dpi }
 * @returns {string} ZPL code
 */
export function generateZPL(elementos, et, cfg, opts = {}) {
    const { largura = 100, altura = 70, dpi = 203 } = opts;
    const wDots = mmToDots(largura, dpi);
    const hDots = mmToDots(altura, dpi);

    let zpl = '';
    zpl += '^XA\n'; // Start format
    zpl += `^PW${wDots}\n`; // Print width
    zpl += `^LL${hDots}\n`; // Label length
    zpl += '^CI28\n'; // UTF-8 encoding

    for (const el of elementos) {
        const x = mmToDots(el.x, dpi);
        const y = mmToDots(el.y, dpi);
        const w = mmToDots(el.w, dpi);
        const h = mmToDots(el.h, dpi);

        switch (el.tipo) {
            case 'texto': {
                const text = resolveVar(el.texto || '', el.variavel, et, cfg);
                if (!text) break;
                // Font size: approximate mm to ZPL font height
                const fontSize = el.fontSize || 3;
                const fontH = mmToDots(fontSize, dpi);
                const fontW = Math.round(fontH * 0.6);
                // Bold: use font F (A=standard, 0=scalable)
                const bold = el.fontWeight >= 600;
                zpl += `^FO${x},${y}\n`;
                zpl += `^A0N,${fontH},${fontW}\n`; // Scalable font
                zpl += `^FD${escapeZPL(text)}^FS\n`;
                break;
            }
            case 'barcode': {
                const val = resolveSimpleVar(el.barcodeVariavel || 'controle', et, cfg);
                if (!val) break;
                const bh = Math.max(h - mmToDots(3, dpi), mmToDots(5, dpi)); // barcode height minus text
                zpl += `^FO${x},${y}\n`;
                zpl += `^BCN,${bh},Y,N,N\n`; // Code 128, height, interpretation line
                zpl += `^FD${escapeZPL(val)}^FS\n`;
                break;
            }
            case 'qrcode': {
                const val = resolveSimpleVar(el.barcodeVariavel || 'controle', et, cfg);
                if (!val) break;
                const mag = Math.max(2, Math.round(w / mmToDots(3, dpi)));
                zpl += `^FO${x},${y}\n`;
                zpl += `^BQN,2,${mag}\n`; // QR Code, model 2, magnification
                zpl += `^FDMA,${escapeZPL(val)}^FS\n`; // M=Medium EC (15%) — tolerância a sujeira/desgaste
                break;
            }
            case 'retangulo': {
                const thickness = mmToDots(el.bordaLargura || 0.3, dpi) || 1;
                zpl += `^FO${x},${y}\n`;
                zpl += `^GB${w},${h},${thickness}^FS\n`;
                break;
            }
            case 'diagrama_bordas': {
                // Draw edge diagram as small rectangles
                const bordas = et?.bordas || {};
                const bw = mmToDots(1.2, dpi);
                // Top
                if (bordas.frontal || bordas.top) {
                    zpl += `^FO${x},${y}^GB${w},${bw},${bw}^FS\n`;
                }
                // Bottom
                if (bordas.traseira || bordas.bottom) {
                    zpl += `^FO${x},${y + h - bw}^GB${w},${bw},${bw}^FS\n`;
                }
                // Left
                if (bordas.esq || bordas.left) {
                    zpl += `^FO${x},${y}^GB${bw},${h},${bw}^FS\n`;
                }
                // Right
                if (bordas.dir || bordas.right) {
                    zpl += `^FO${x + w - bw},${y}^GB${bw},${h},${bw}^FS\n`;
                }
                break;
            }
        }
    }

    zpl += '^XZ\n'; // End format
    return zpl;
}

/**
 * Generate ZPL for multiple labels (batch print).
 * @param {Array} elementos - Template elements
 * @param {Array} etiquetas - Array of etiqueta data objects
 * @param {object} cfg - Label config
 * @param {object} opts - { largura, altura, dpi, copies }
 * @returns {string} Full ZPL batch
 */
export function generateZPLBatch(elementos, etiquetas, cfg, opts = {}) {
    const { copies = 1 } = opts;
    let batch = '';
    for (const et of etiquetas) {
        const zpl = generateZPL(elementos, et, cfg, opts);
        // Add quantity copies
        const qty = et.quantidade || copies;
        if (qty > 1) {
            batch += zpl.replace('^XZ', `^PQ${qty},0,1,Y\n^XZ`);
        } else {
            batch += zpl;
        }
    }
    return batch;
}

function escapeZPL(text) {
    return String(text).replace(/\^/g, ' ').replace(/~/g, ' ');
}

function resolveVar(text, variavel, et, cfg) {
    if (variavel && et) {
        const val = et[variavel] || cfg?.[variavel] || '';
        return String(val);
    }
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => et?.[key] || cfg?.[key] || '');
}

function resolveSimpleVar(key, et, cfg) {
    // Bug fix: antes retornava `key` como fallback (ex: "controle") quando a variável era vazia
    const val = et?.[key] ?? cfg?.[key];
    return val != null && val !== '' ? String(val) : '';
}
