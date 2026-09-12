import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// COOP/COEP make the page cross-origin isolated, which is what unlocks SharedArrayBuffer
// and therefore the multithreaded ffmpeg core. Production hosting must send the same
// headers (see apps/web/public/_headers for Cloudflare Pages).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    // @ffmpeg/ffmpeg spawns its own module worker via import.meta.url; pre-bundling breaks that.
    exclude: ['@ffmpeg/ffmpeg'],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
