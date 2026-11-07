import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run demo', url: 'http://127.0.0.1:4173/api/health', reuseExistingServer: false },
});
