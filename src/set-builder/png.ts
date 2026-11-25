import { inflateSync } from 'node:zlib';

// A decoder for the one kind of PNG ProPresenter 22 sends as a thumbnail (test/fixtures/propresenter/README.md, "The
// 2026-11-12 session"): 8 bits a channel, red, green, blue and alpha, not interlaced. It reads the header, joins and
// inflates the picture data with the standard library's zlib, and undoes the five line filters. It checks no CRC, and
// skips every chunk it does not need, such as the eXIf and sRGB chunks ProPresenter writes before the picture.

// A picture: its size in pixels, and its pixels in rows from the top, four bytes each: red, green, blue, alpha.
export type Picture = { width: number; height: number; rgba: Buffer };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The bytes of a pixel, which a filter reaches back by.
const PIXEL = 4;

// The picture a PNG file holds. Throws an Error whose message says why the file is not one this decoder reads, to
// follow "the picture cannot be read:" in a problem line.
export function decodePng(file: Buffer): Picture {
  if (!file.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new Error('it is no PNG');
  let size: { width: number; height: number } | undefined;
  const data: Buffer[] = [];
  // Each chunk: its length, its type, its bytes, and a CRC.
  for (let at = SIGNATURE.length; at + 8 <= file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (body.length < length) throw new Error('it is cut short');
    if (type === 'IHDR' && length >= 13) {
      const [depth, colourType, interlace] = [body[8], body[9], body[12]];
      if (depth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(`it is not 8-bit RGBA without interlacing: its bit depth is ${depth}, its colour type ${colourType} and its interlace method ${interlace}`);
      }
      size = { width: body.readUInt32BE(0), height: body.readUInt32BE(4) };
    }
    if (type === 'IDAT') data.push(body);
    if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!size) throw new Error('it has no header');
  const { width, height } = size;
  let lines: Buffer;
  try {
    lines = inflateSync(Buffer.concat(data));
  } catch {
    throw new Error('its picture data cannot be inflated');
  }
  // Each line of the picture is one byte that names its filter, then its pixels.
  const row = width * PIXEL;
  if (lines.length < (row + 1) * height) throw new Error('its picture data is cut short');
  const rgba = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    const filter = lines[y * (row + 1)]!;
    if (filter > 4) throw new Error(`a line of it has the filter ${filter}, which no PNG has`);
    const line = y * (row + 1) + 1;
    const out = y * row;
    for (let x = 0; x < row; x += 1) {
      // The same byte of the pixel to the left, of the pixel above, and of the pixel above that one, 0 past an edge.
      const left = x >= PIXEL ? rgba[out + x - PIXEL]! : 0;
      const up = y > 0 ? rgba[out + x - row]! : 0;
      const upLeft = x >= PIXEL && y > 0 ? rgba[out + x - row - PIXEL]! : 0;
      const predicted = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      rgba[out + x] = (lines[line + x]! + predicted) & 0xff;
    }
  }
  return { width, height, rgba };
}

// The Paeth predictor of the PNG specification: of the three neighbours, the one nearest left + up - upLeft, the left
// one first and the upper one second on a tie.
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const [fromLeft, fromUp, fromUpLeft] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
  if (fromLeft <= fromUp && fromLeft <= fromUpLeft) return left;
  return fromUp <= fromUpLeft ? up : upLeft;
}
