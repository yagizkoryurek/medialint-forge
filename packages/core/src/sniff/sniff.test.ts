import { describe, expect, it } from 'vitest';
import { fixtureHead } from '../testing/fixtures';
import { extMatchesFormat, extOf, sniff } from './magic';
import { scanMp4Boxes } from './mp4boxes';

describe('extOf', () => {
  it('lower-cases and strips the dot', () => {
    expect(extOf('Clip.MP4')).toBe('mp4');
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(extOf('noext')).toBe('');
    expect(extOf('.hidden')).toBe('');
    expect(extOf('trailing.')).toBe('');
  });
});

describe('sniff', () => {
  it.each([
    ['h264-ok.mp4', 'mp4', true],
    ['not-faststart.mp4', 'mp4', true],
    ['hevc.mov', 'mov', true],
    ['prores.mov', 'mov', true],
    ['h264.mkv', 'mkv', true],
    ['vp9.webm', 'webm', true],
    ['gps.jpg', 'jpeg', true],
    ['plain.jpg', 'jpeg', true],
    ['16bit.png', 'png', true],
    ['big.webp', 'webp', true],
    ['actually-png.jpg', 'png', false],
  ] as const)('%s → %s (ext matches: %s)', (name, format, matches) => {
    const r = sniff(name, fixtureHead(name));
    expect(r.format).toBe(format);
    expect(r.extMatches).toBe(matches);
  });

  it('reports faststart for MP4/MOV', () => {
    expect(sniff('h264-ok.mp4', fixtureHead('h264-ok.mp4')).fastStart).toBe(true);
    expect(sniff('not-faststart.mp4', fixtureHead('not-faststart.mp4')).fastStart).toBe(false);
    expect(sniff('rotated.mp4', fixtureHead('rotated.mp4')).fastStart).toBe(true);
  });

  it('records the major brand', () => {
    expect(sniff('hevc.mov', fixtureHead('hevc.mov')).brand).toBe('qt  ');
    expect(sniff('h264-ok.mp4', fixtureHead('h264-ok.mp4')).brand).toBe('isom');
  });

  it('returns unknown for garbage and tiny inputs', () => {
    expect(sniff('x.mp4', new Uint8Array([1, 2, 3])).format).toBe('unknown');
    expect(sniff('x.mp4', new Uint8Array(64)).format).toBe('unknown');
  });

  it('treats .mov/.mp4 as interchangeable for ext matching but not others', () => {
    expect(extMatchesFormat('mp4', 'mov')).toBe(true);
    expect(extMatchesFormat('mov', 'mp4')).toBe(true);
    expect(extMatchesFormat('webm', 'mkv')).toBe(false);
    expect(extMatchesFormat('png', 'jpeg')).toBe(false);
    expect(extMatchesFormat('', 'mp4')).toBe(false);
  });
});

describe('scanMp4Boxes', () => {
  it('walks ftyp → moov → mdat', () => {
    const scan = scanMp4Boxes(fixtureHead('h264-ok.mp4'));
    expect(scan.boxes.slice(0, 2)).toEqual(['ftyp', 'moov']);
    expect(scan.fastStart).toBe(true);
  });

  it('stops at mdat when moov is at the end', () => {
    const scan = scanMp4Boxes(fixtureHead('not-faststart.mp4'));
    expect(scan.boxes).toContain('mdat');
    expect(scan.boxes).not.toContain('moov');
    expect(scan.fastStart).toBe(false);
  });

  it('returns null when neither box is present in the buffer', () => {
    // A lone ftyp box.
    const buf = new Uint8Array([
      0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
    ]);
    expect(scanMp4Boxes(buf).fastStart).toBe(null);
  });
});
