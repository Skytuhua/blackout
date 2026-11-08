import { defineConfig } from '@playwright/test';
const reviewOrigin = process.env.BLACKOUT_REVIEW_ORIGIN;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: reviewOrigin ?? 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } },
  webServer: reviewOrigin ? undefined : { command: 'npm run demo', url: 'http://127.0.0.1:4173/api/health', reuseExistingServer: false },
});
