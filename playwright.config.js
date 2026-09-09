const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory site', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
