import { extOf } from '../sniff/magic';
import type { ImageProbeRaw } from '../types/engine';
import type { MediaReport, SniffResult } from '../types/report';

export interface FromImageProbeInput {
  fileName: string;
  sizeBytes: number;
  sniff: SniffResult;
  probe: ImageProbeRaw;
}

export function fromImageProbe(input: FromImageProbeInput): MediaReport {
  const p = input.probe;
  const tags: Record<string, string> = { ...p.tags };
  if (p.make) tags.Make = p.make;
  if (p.model) tags.Model = p.model;
  if (p.software) tags.Software = p.software;
  if (p.orientation !== null) tags.Orientation = String(p.orientation);
  if (p.creationTime) tags.DateTimeOriginal = p.creationTime;

  return {
    kind: 'image',
    fileName: input.fileName,
    ext: extOf(input.fileName),
    sizeBytes: input.sizeBytes,
    sniff: input.sniff,
    container: null,
    video: null,
    audio: [],
    streamCounts: { video: 0, audio: 0, subtitle: 0, other: 0 },
    image: {
      format: p.format,
      width: p.width,
      height: p.height,
      bitDepth: p.bitDepth,
      orientation: p.orientation,
      hasAlpha: p.hasAlpha,
      animated: p.animated,
    },
    metadata: {
      gps: p.gps,
      make: p.make,
      model: p.model,
      software: p.software,
      creationTime: p.creationTime,
      tags,
    },
    raw: { ...p, tags: p.tags },
  };
}
