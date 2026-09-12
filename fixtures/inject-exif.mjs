#!/usr/bin/env node
// Injects a minimal EXIF APP1 segment (Make, Model, Software, Orientation, GPS) into a JPEG.
// Used by fixtures/generate.sh because ffmpeg cannot write EXIF and we don't want exiftool
// as a contributor prerequisite. Also handy for tests of the lossless stripper.
//
// Usage: node inject-exif.mjs <in.jpg> <out.jpg> [--orientation N] [--no-gps]

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: inject-exif.mjs <in.jpg> <out.jpg> [--orientation N] [--no-gps]');
  process.exit(2);
}
const orientation = Number(rest[rest.indexOf('--orientation') + 1] || 1) || 1;
const withGps = !rest.includes('--no-gps');

const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const BYTE = 1;

// ---- build a little-endian TIFF with IFD0 (+ GPS IFD) ----------------------------------
function ifdEntries(entries) {
  // entries: [{tag, type, values}] → returns {dirBytes, dataBytes} with offsets resolved later
  return entries;
}

function encodeTiff(ifd0, gpsIfd) {
  const chunks = [];
  const header = Buffer.alloc(8);
  header.write('II', 0, 'ascii');
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);
  chunks.push(header);

  const layout = [{ name: 'ifd0', entries: ifd0 }];
  if (gpsIfd) layout.push({ name: 'gps', entries: gpsIfd });

  // First pass: compute directory sizes to know where each IFD and its data blob live.
  let cursor = 8;
  const positions = {};
  for (const dir of layout) {
    const dirSize = 2 + dir.entries.length * 12 + 4;
    positions[dir.name] = { dirOffset: cursor, dataOffset: cursor + dirSize };
    // Only values that don't fit in 4 bytes go to the data area (padded to even length).
    const dataSize = dir.entries.reduce((n, e) => {
      const vb = valueBytes(e);
      return n + (vb.length > 4 ? vb.length + (vb.length % 2) : 0);
    }, 0);
    cursor += dirSize + dataSize;
  }

  for (const dir of layout) {
    const { dataOffset } = positions[dir.name];
    const dirBuf = Buffer.alloc(2 + dir.entries.length * 12 + 4);
    const dataParts = [];
    let dataCursor = dataOffset;
    dirBuf.writeUInt16LE(dir.entries.length, 0);
    dir.entries
      .slice()
      .sort((a, b) => a.tag - b.tag)
      .forEach((e, i) => {
        const base = 2 + i * 12;
        const vb = e.tag === 0x8825 ? u32(positions.gps.dirOffset) : valueBytes(e);
        dirBuf.writeUInt16LE(e.tag, base);
        dirBuf.writeUInt16LE(e.type, base + 2);
        dirBuf.writeUInt32LE(count(e), base + 4);
        if (vb.length <= 4) {
          vb.copy(dirBuf, base + 8);
        } else {
          dirBuf.writeUInt32LE(dataCursor, base + 8);
          const padded = vb.length % 2 ? Buffer.concat([vb, Buffer.alloc(1)]) : vb;
          dataParts.push(padded);
          dataCursor += padded.length;
        }
      });
    dirBuf.writeUInt32LE(0, 2 + dir.entries.length * 12); // next IFD = none
    chunks.push(dirBuf, ...dataParts);
  }
  return Buffer.concat(chunks);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}
function count(e) {
  if (e.type === ASCII) return Buffer.byteLength(e.values) + 1;
  if (e.type === RATIONAL) return e.values.length;
  if (e.type === BYTE) return e.values.length;
  return e.values.length ?? 1;
}
function valueBytes(e) {
  if (e.type === ASCII) return Buffer.from(`${e.values}\0`, 'ascii');
  if (e.type === SHORT) {
    const b = Buffer.alloc(2 * e.values.length);
    e.values.forEach((v, i) => {
      b.writeUInt16LE(v, i * 2);
    });
    return b;
  }
  if (e.type === LONG) {
    const b = Buffer.alloc(4 * e.values.length);
    e.values.forEach((v, i) => {
      b.writeUInt32LE(v, i * 4);
    });
    return b;
  }
  if (e.type === RATIONAL) {
    const b = Buffer.alloc(8 * e.values.length);
    e.values.forEach(([n, d], i) => {
      b.writeUInt32LE(n, i * 8);
      b.writeUInt32LE(d, i * 8 + 4);
    });
    return b;
  }
  if (e.type === BYTE) return Buffer.from(e.values);
  throw new Error(`unsupported type ${e.type}`);
}

function dms(deg) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

const ifd0 = ifdEntries([
  { tag: 0x010f, type: ASCII, values: 'MediaLint Test Camera' },
  { tag: 0x0110, type: ASCII, values: 'ML-1000' },
  { tag: 0x0112, type: SHORT, values: [orientation] },
  { tag: 0x0131, type: ASCII, values: 'inject-exif.mjs' },
]);
let gpsIfd = null;
if (withGps) {
  ifd0.push({ tag: 0x8825, type: LONG, values: [0] }); // GPS IFD pointer (patched in encodeTiff)
  const lat = 37.7749;
  const lon = -122.4194;
  gpsIfd = ifdEntries([
    { tag: 0x0000, type: BYTE, values: [2, 3, 0, 0] },
    { tag: 0x0001, type: ASCII, values: lat >= 0 ? 'N' : 'S' },
    { tag: 0x0002, type: RATIONAL, values: dms(lat) },
    { tag: 0x0003, type: ASCII, values: lon >= 0 ? 'E' : 'W' },
    { tag: 0x0004, type: RATIONAL, values: dms(lon) },
  ]);
}

const tiff = encodeTiff(ifd0, gpsIfd);
const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
const app1 = Buffer.alloc(4 + payload.length);
app1.writeUInt16BE(0xffe1, 0);
app1.writeUInt16BE(payload.length + 2, 2);
payload.copy(app1, 4);

const jpeg = readFileSync(inPath);
if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
  console.error('not a JPEG');
  process.exit(1);
}
writeFileSync(outPath, Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]));
console.log(`wrote ${outPath} (orientation=${orientation}, gps=${withGps})`);
