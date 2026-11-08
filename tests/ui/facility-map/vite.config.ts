import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  cacheDir: '.local/facility-map-01/vite-cache',
  server: { host: '127.0.0.1', port: 5194, strictPort: true, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  build: { outDir: '.local/facility-map-01/build', rollupOptions: { input: resolve('tests/ui/facility-map/fixture.html') } },
});
