import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height) {
  // Minimal PNG generator using zlib
  const signature = Buffer.from([137, 80, 78, 72, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // Scanlines: filter byte 0 + RGBA per pixel
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // None filter
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;

      // Dark luxury background (#09090b)
      let pr = 9;
      let pg = 9;
      let pb = 11;
      let pa = 255;

      // Draw stylized coffee bean in center
      // Bean boundary: ellipse with (dx/rx)^2 + (dy/ry)^2 <= 1
      const rx = width * 0.22;
      const ry = height * 0.32;
      const beanDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

      if (beanDist <= 1.0) {
        // Vertical seam
        if (Math.abs(dx) < width * 0.015) {
          pr = 9; pg = 9; pb = 11; // center slit
        } else if (dx < 0) {
          // Left half: solid white coffee bean
          pr = 255; pg = 255; pb = 255;
        } else {
          // Right half: piano keys
          const keyIndex = Math.floor(((dy + ry) / (ry * 2)) * 6);
          const inKeyGap = Math.abs((dy + ry) % (ry * 2 / 6)) < (height * 0.015);
          if (inKeyGap) {
            pr = 9; pg = 9; pb = 11;
          } else {
            // White key or black key
            if (dx < rx * 0.45 && (keyIndex === 1 || keyIndex === 2 || keyIndex === 4)) {
              pr = 9; pg = 9; pb = 11; // black key notch
            } else {
              pr = 255; pg = 255; pb = 255; // white key
            }
          }
        }
      }

      rawData[pxOffset] = pr;
      rawData[pxOffset + 1] = pg;
      rawData[pxOffset + 2] = pb;
      rawData[pxOffset + 3] = pa;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idat, iendChunk]);
}

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), createPng(192, 192));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), createPng(512, 512));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), createPng(512, 512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), createPng(180, 180));
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), createPng(64, 64));
console.log('CHORD #Kopi_kebun icons generated successfully.');
