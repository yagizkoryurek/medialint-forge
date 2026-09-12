import { describe, expect, it } from 'vitest';
import { listProbes, videoReport } from '../testing/fixtures';
import { parseRate, rotationOf } from './fromFfprobe';
import { fromImageProbe } from './fromImageProbe';
import { extractMetadata, parseIso6709 } from './metadata';

describe('fromFfprobe (fixtures)', () => {
  it('normalizes every committed probe without throwing', () => {
    for (const name of listProbes()) {
      const r = videoReport(name);
      expect(r.kind).toBe('video');
      expect(r.fileName).toBe(name);
      expect(r.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('h264-ok.mp4 is a clean web-ready file', () => {
    const r = videoReport('h264-ok.mp4');
    expect(r.video).toMatchObject({
      codec: 'h264',
      pixFmt: 'yuv420p',
      bitDepth: 8,
      width: 320,
      height: 180,
      fpsAvg: 30,
      isVFR: false,
      rotation: 0,
    });
    expect(r.audio[0]).toMatchObject({ codec: 'aac', sampleRate: 48000 });
    expect(r.container?.durationSec).toBeCloseTo(2, 0);
    expect(r.streamCounts).toEqual({ video: 1, audio: 1, subtitle: 0, other: 0 });
    expect(r.metadata.gps).toBeNull();
    expect(r.metadata.make).toBeNull();
  });

  it('hevc.mov exposes codec and container', () => {
    const r = videoReport('hevc.mov');
    expect(r.video?.codec).toBe('hevc');
    expect(r.sniff.format).toBe('mov');
    expect(r.container?.formatName).toContain('mov');
  });

  it('prores.mov exposes 10-bit 4:2:2', () => {
    const r = videoReport('prores.mov');
    expect(r.video?.codec).toBe('prores');
    expect(r.video?.pixFmt).toBe('yuv422p10le');
    expect(r.video?.bitDepth).toBe(10);
  });

  it('rotated.mp4 reports clockwise display rotation', () => {
    // Fixture written with `-display_rotation 90` (counter-clockwise) → 270° clockwise.
    const r = videoReport('rotated.mp4');
    expect(r.video?.rotation).toBe(270);
  });

  it('gps.mov exposes location and device metadata', () => {
    const r = videoReport('gps.mov');
    expect(r.metadata.gps).toEqual({ lat: 37.7749, lon: -122.4194 });
    expect(r.metadata.make).toBe('MediaLint Test Camera');
    expect(r.metadata.model).toBe('ML-1000');
  });

  it('pcm-audio.mov and no-audio.mp4 expose audio facts', () => {
    expect(videoReport('pcm-audio.mov').audio[0]?.codec).toBe('pcm_s16le');
    const na = videoReport('no-audio.mp4');
    expect(na.audio).toEqual([]);
    expect(na.streamCounts.audio).toBe(0);
  });

  it('odd-dims.mp4 keeps odd dimensions', () => {
    const r = videoReport('odd-dims.mp4');
    expect(r.video?.width).toBe(321);
    expect(r.video?.height).toBe(181);
  });

  it('matches snapshot for a representative report (minus raw)', () => {
    const { raw: _raw, ...rest } = videoReport('hevc.mov');
    expect(rest).toMatchSnapshot();
  });
});

describe('parseRate / rotationOf', () => {
  it('parses fractional and decimal rates', () => {
    expect(parseRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseRate('25')).toBe(25);
    expect(parseRate('0/0')).toBeNull();
    expect(parseRate(undefined)).toBeNull();
  });

  it('normalizes display-matrix and rotate-tag conventions to clockwise degrees', () => {
    expect(
      rotationOf({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }] }),
    ).toBe(90);
    expect(
      rotationOf({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: 90 }] }),
    ).toBe(270);
    expect(
      rotationOf({ side_data_list: [{ side_data_type: 'Display Matrix', rotation: 180 }] }),
    ).toBe(180);
    expect(rotationOf({ tags: { rotate: '90' } })).toBe(90);
    expect(rotationOf({ tags: { rotate: '-90' } })).toBe(270);
    expect(rotationOf({})).toBe(0);
  });
});

describe('metadata', () => {
  it('parses ISO 6709', () => {
    expect(parseIso6709('+37.7749-122.4194/')).toEqual({ lat: 37.7749, lon: -122.4194 });
    expect(parseIso6709('+40.7128-074.0060+010.5/')).toEqual({ lat: 40.7128, lon: -74.006 });
    expect(parseIso6709('nonsense')).toBeNull();
    expect(parseIso6709('+95.0+000.0/')).toBeNull();
  });

  it('is case-insensitive for device keys and keeps every tag as evidence', () => {
    const m = extractMetadata({ MAKE: 'Acme', Model: 'X1', creation_time: '2024-01-01T00:00:00Z' });
    expect(m.make).toBe('Acme');
    expect(m.model).toBe('X1');
    expect(m.creationTime).toBe('2024-01-01T00:00:00Z');
    expect(m.tags.MAKE).toBe('Acme');
  });
});

describe('fromImageProbe', () => {
  it('builds an image report', () => {
    const r = fromImageProbe({
      fileName: 'photo.JPG',
      sizeBytes: 1234,
      sniff: { format: 'jpeg', extMatches: true },
      probe: {
        kind: 'image',
        format: 'jpeg',
        width: 4000,
        height: 3000,
        bitDepth: null,
        hasAlpha: false,
        animated: false,
        orientation: 6,
        gps: { lat: 1, lon: 2 },
        make: 'Acme',
        model: 'X1',
        software: null,
        creationTime: null,
        tags: {},
      },
    });
    expect(r.kind).toBe('image');
    expect(r.ext).toBe('jpg');
    expect(r.image).toMatchObject({ format: 'jpeg', width: 4000, height: 3000, orientation: 6 });
    expect(r.metadata.gps).toEqual({ lat: 1, lon: 2 });
    expect(r.metadata.tags.Orientation).toBe('6');
  });
});
