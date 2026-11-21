import { defineConfig } from '@playwright/test';

const ROOT_DIR = decodeURIComponent(new URL('../..', import.meta.url).pathname);
const ARTIFACT_DIR =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.ARTIFACT_DIR ??
  decodeURIComponent(new URL('../../test-results/artifacts', import.meta.url).pathname);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: `${ARTIFACT_DIR}/pw-artifacts`,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    headless: true,
    channel: 'chrome',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: [
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      cwd: ROOT_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      cwd: ROOT_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
