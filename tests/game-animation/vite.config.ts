import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5191, strictPort: true, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
});
