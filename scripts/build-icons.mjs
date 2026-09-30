// Code-native icon: a long document with a downward archive arrow.
// No fonts, network dependencies, or raster source assets required.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const directory = new URL('../icons/', import.meta.url);
await mkdir(directory, { recursive: true });

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
function rounded(x, y, left, top, width, height, radius) {
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius));
  return x >= left && x <= left + width && y >= top && y <= top + height && dx * dx + dy * dy <= radius * radius;
}
function pixel(x, y) {
  if (!rounded(x, y, 2, 2, 124, 124, 27)) return [0, 0, 0, 0];
  const color = [Math.round(34 + y * .08), Math.round(83 + y * .15), Math.round(180 + y * .24), 255];
  if (rounded(x, y, 29, 20, 70, 88, 10)) color.splice(0, 3, 250, 252, 255);
  const ink = [45, 102, 210, 255];
  if (rounded(x, y, 41, 34, 45, 5, 2.5) || rounded(x, y, 41, 46, 36, 5, 2.5) || rounded(x, y, 41, 58, 27, 5, 2.5)) return ink;
  if (rounded(x, y, 61, 72, 6, 18, 3)) return ink;
  const lineDistance = (ax, ay, bx, by) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
  };
  if (lineDistance(54, 84, 64, 94) < 3 || lineDistance(64, 94, 74, 84) < 3) return ink;
  return color;
}
for (const size of [16, 32, 48, 128]) {
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const color = pixel((x + (sx + .5) / 4) * 128 / size, (y + (sy + .5) / 4) * 128 / size);
        color.forEach((value, index) => { sums[index] += value; });
      }
      sums.forEach((sum, index) => { scanlines[y * (size * 4 + 1) + 1 + x * 4 + index] = Math.round(sum / 16); });
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(new URL(`icon-${size}.png`, directory), png);
}
console.log('Generated ScrollKeep icons (16, 32, 48, 128 px).');
