/**
 * Code128B Barcode Generator — padrão industrial legível por qualquer scanner.
 *
 * Encoding: Code128 subset B (ASCII 32-127)
 * Output: Array of bar widths for SVG rendering
 */

// Code128B character set patterns (bar/space widths)
// Each pattern is 6 elements: b s b s b s (bar, space alternating)
const PATTERNS = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1],[2,1,1,1,3,2],
];

const START_B = 104;
const STOP = [2,3,3,1,1,1,2]; // stop pattern (7 elements)

/**
 * Encode a string to Code128B bar widths
 * @param {string} text - Text to encode (ASCII 32-127)
 * @returns {number[]} Array of bar widths (alternating bar/space starting with bar)
 */
export function encode128B(text) {
  const str = String(text || '');
  const values = [START_B];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 127) {
      values.push(code - 32);
    }
  }
  // Calculate checksum
  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum += values[i] * i;
  }
  checksum = checksum % 103;
  values.push(checksum);

  // Convert values to bar widths
  const bars = [];
  for (const v of values) {
    bars.push(...PATTERNS[v]);
  }
  bars.push(...STOP);
  return bars;
}

/**
 * Generate SVG rects for a Code128B barcode
 * @param {string} text - Text to encode
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Total width
 * @param {number} h - Total height (bars use 75%, text uses 25%)
 * @returns {{ bars: Array<{x:number, w:number}>, totalUnits: number }}
 */
export function code128Bars(text, x, y, w, h) {
  const widths = encode128B(text);
  const totalUnits = widths.reduce((s, v) => s + v, 0);
  const unitW = w / totalUnits;
  const bars = [];
  let pos = 0;
  for (let i = 0; i < widths.length; i++) {
    if (i % 2 === 0) { // even index = bar (black)
      bars.push({ x: x + pos * unitW, w: widths[i] * unitW });
    }
    pos += widths[i];
  }
  return { bars, totalUnits };
}
