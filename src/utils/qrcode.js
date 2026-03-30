/**
 * Minimal QR Code generator (SVG output).
 * Based on nayuki/QR-Code-generator — simplified for label usage.
 * Supports alphanumeric content up to ~100 chars (Version 1-5, EC Level L).
 */

// Galois Field GF(256) tables
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
{
    let v = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = v;
        LOG[v] = i;
        v = (v << 1) ^ (v >= 128 ? 0x11d : 0);
    }
    EXP[255] = EXP[0];
}

function gfMul(a, b) { return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255]; }

function polyMul(a, b) {
    const r = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i++)
        for (let j = 0; j < b.length; j++)
            r[i + j] ^= gfMul(a[i], b[j]);
    return r;
}

function rsGenerator(n) {
    let g = new Uint8Array([1]);
    for (let i = 0; i < n; i++)
        g = polyMul(g, new Uint8Array([1, EXP[i]]));
    return g;
}

function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
        const coef = msg[i];
        if (coef !== 0) {
            for (let j = 0; j < gen.length; j++)
                msg[i + j] ^= gfMul(gen[j], coef);
        }
    }
    return msg.slice(data.length);
}

// QR version params (1-5, EC Level L)
const VERSIONS = [
    null,
    { total: 26, ec: 7, dataCodewords: 19, groups: [[1, 19]] },
    { total: 44, ec: 10, dataCodewords: 34, groups: [[1, 34]] },
    { total: 70, ec: 15, dataCodewords: 55, groups: [[1, 55]] },
    { total: 100, ec: 20, dataCodewords: 80, groups: [[1, 80]] },
    { total: 134, ec: 26, dataCodewords: 108, groups: [[1, 108]] },
];

function chooseVersion(bitLen) {
    for (let v = 1; v <= 5; v++) {
        if (bitLen <= VERSIONS[v].dataCodewords * 8) return v;
    }
    return 5; // Truncate if needed
}

function encodeData(text) {
    // Byte mode encoding
    const bytes = new TextEncoder().encode(text);
    const bits = [];

    // Mode indicator: 0100 (byte mode)
    bits.push(0, 1, 0, 0);

    // Character count
    const version = chooseVersion((bytes.length + 3) * 8);
    const ccBits = version <= 9 ? 8 : 16;
    for (let i = ccBits - 1; i >= 0; i--)
        bits.push((bytes.length >> i) & 1);

    // Data
    for (const b of bytes)
        for (let i = 7; i >= 0; i--)
            bits.push((b >> i) & 1);

    // Terminator (up to 4 bits of 0)
    const capacity = VERSIONS[version].dataCodewords * 8;
    const termLen = Math.min(4, capacity - bits.length);
    for (let i = 0; i < termLen; i++) bits.push(0);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad codewords
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < capacity) {
        for (let i = 7; i >= 0; i--)
            bits.push((padBytes[padIdx] >> i) & 1);
        padIdx = (padIdx + 1) % 2;
    }

    // Convert to bytes
    const data = new Uint8Array(VERSIONS[version].dataCodewords);
    for (let i = 0; i < data.length; i++) {
        let val = 0;
        for (let j = 0; j < 8; j++)
            val = (val << 1) | (bits[i * 8 + j] || 0);
        data[i] = val;
    }

    // RS error correction
    const ec = rsEncode(data, VERSIONS[version].ec);

    // Interleave (single block for v1-5 Level L)
    const final = new Uint8Array(data.length + ec.length);
    final.set(data);
    final.set(ec, data.length);

    return { codewords: final, version };
}

function createMatrix(version) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => new Int8Array(size)); // 0=empty, 1=black, -1=white(fixed)
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));

    // Finder patterns
    function setFinder(r, c) {
        for (let dr = -1; dr <= 7; dr++)
            for (let dc = -1; dc <= 7; dc++) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
                const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
                const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
                const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
                matrix[rr][cc] = (inInner || (inOuter && onBorder)) ? 1 : -1;
                reserved[rr][cc] = 1;
            }
    }
    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = matrix[i][6] = (i % 2 === 0) ? 1 : -1;
        reserved[6][i] = reserved[i][6] = 1;
    }

    // Dark module
    matrix[size - 8][8] = 1;
    reserved[size - 8][8] = 1;

    // Reserve format info areas
    for (let i = 0; i < 9; i++) {
        if (i < size) { reserved[8][i] = 1; reserved[i][8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
        reserved[8][size - 1 - i] = 1;
        reserved[size - 1 - i][8] = 1;
    }

    return { matrix, reserved, size };
}

function placeData(matrix, reserved, size, codewords) {
    const bits = [];
    for (const b of codewords)
        for (let i = 7; i >= 0; i--)
            bits.push((b >> i) & 1);

    let bitIdx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5; // Skip timing column
        for (let vert = 0; vert < size; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) / 2 | 0) % 2 === 0;
                const y = upward ? size - 1 - vert : vert;
                if (y < 0 || y >= size || x < 0 || x >= size) continue;
                if (reserved[y][x]) continue;
                if (bitIdx < bits.length) {
                    matrix[y][x] = bits[bitIdx] ? 1 : -1;
                    bitIdx++;
                } else {
                    matrix[y][x] = -1;
                }
            }
        }
    }
}

function applyMask(matrix, reserved, size, maskId) {
    const maskFn = [
        (r, c) => (r + c) % 2 === 0,
        (r, c) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
        (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
        (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ][maskId];

    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            if (!reserved[r][c] && maskFn(r, c))
                matrix[r][c] = matrix[r][c] === 1 ? -1 : 1;
}

function writeFormatInfo(matrix, size, maskId) {
    // Format: EC Level L (01) + mask pattern
    const formatBits = [
        0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
    ][maskId];

    for (let i = 0; i < 15; i++) {
        const bit = (formatBits >> (14 - i)) & 1 ? 1 : -1;
        // Top-left
        if (i < 6) matrix[8][i] = bit;
        else if (i === 6) matrix[8][7] = bit;
        else if (i === 7) matrix[8][8] = bit;
        else if (i === 8) matrix[7][8] = bit;
        else matrix[14 - i][8] = bit;
        // Other
        if (i < 8) matrix[size - 1 - i][8] = bit;
        else matrix[8][size - 15 + i] = bit;
    }
}

/**
 * Generate QR code as SVG string.
 * @param {string} text - Content to encode
 * @param {number} moduleSize - Size of each module in px (default 4)
 * @param {string} color - Module color (default '#000')
 * @returns {string} SVG markup
 */
export function qrcodeSVG(text, moduleSize = 4, color = '#000') {
    if (!text) return '';

    const { codewords, version } = encodeData(text);
    const { matrix, reserved, size } = createMatrix(version);
    placeData(matrix, reserved, size, codewords);

    // Try all masks, pick best (simplest: use mask 0)
    applyMask(matrix, reserved, size, 0);
    writeFormatInfo(matrix, size, 0);

    const margin = 4;
    const totalSize = (size + margin * 2) * moduleSize;
    let rects = '';
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            if (matrix[r][c] === 1)
                rects += `<rect x="${(c + margin) * moduleSize}" y="${(r + margin) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="${color}"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}"><rect width="${totalSize}" height="${totalSize}" fill="#fff"/>${rects}</svg>`;
}
