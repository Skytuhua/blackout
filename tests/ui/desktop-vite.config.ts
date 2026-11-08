import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
// Optional read-only asset dependency; no artwork is copied or staged by the UI worker.
export default defineConfig({
  plugins: [react()],
  publicDir: process.env.DESKTOP_ART_DIRECTORY || 'public',
  build: { outDir: '.local/desktop-ui/build', rollupOptions: { input: resolve('src/ui/desktop-fixture.html') }, chunkSizeWarningLimit: 1800 },
  server: { host: '127.0.0.1', port: 5176, strictPort: true, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
});
