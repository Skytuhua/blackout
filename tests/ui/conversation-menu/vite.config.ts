import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5192, strictPort: true, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  build: { outDir: '.local/menu-01-build', rollupOptions: { input: resolve('tests/ui/conversation-menu/fixture.html') } },
});
