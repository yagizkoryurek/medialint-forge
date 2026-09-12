import type { Profile } from '../types/profile';

const MB = 1024 * 1024;

/**
 * The only profile shipped in v0.1: "plays in current desktop and mobile browsers without
 * plugins". Deliberately conservative — H.264/AAC in MP4 is the universal baseline; VP8/VP9/Opus in
 * WebM is universal too; AV1 is accepted because every current browser decodes it in software.
 */
export const webBrowsers: Profile = {
  id: 'web-browsers',
  name: 'Web browsers',
  description: 'current Chrome, Firefox, Safari and Edge, desktop and mobile',
  containers: ['mp4', 'webm'],
  videoCodecs: ['h264', 'vp8', 'vp9', 'av1'],
  audioCodecs: {
    mp4: ['aac', 'mp3'],
    mov: ['aac', 'mp3'],
    webm: ['opus', 'vorbis'],
    mkv: ['aac', 'mp3', 'opus', 'vorbis'],
    '*': ['aac', 'mp3', 'opus', 'vorbis'],
  },
  pixFmts: ['yuv420p', 'yuvj420p'],
  imageFormats: ['jpeg', 'png', 'webp'],
  maxVideoBytes: 100 * MB,
  maxImageBytes: 10 * MB,
  maxImageSide: 8192,
  maxImagePixels: 25_000_000,
  requiresAudio: false,
};

export const PROFILES: ReadonlyArray<Profile> = [webBrowsers];

export function getProfile(id: string): Profile {
  return PROFILES.find((p) => p.id === id) ?? webBrowsers;
}
